import { Autolinker } from "autolinker"
import { normalizeUserInput } from "./normalize"

export interface DetectedUrl {
  readonly raw: string
  readonly url: URL
}

const autolinkerOptions = {
  urls: {
    schemeMatches: true,
    tldMatches: false,
    ipV4Matches: false,
  },
  email: false,
  phone: false,
  mention: false,
  hashtag: false,
  stripPrefix: false,
  stripTrailingSlash: false,
  sanitizeHtml: false,
} as const

// Characters that can appear in an HTTP(S) URL. Anything else, including glued Chinese, ends the candidate.
const urlChars = new Set(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~:/?#[]@!$&'()*+,;=%",
)

// Autolinker sometimes keeps a closing mark that is legal inside a URL. A pasted sentence should not.
const trailingChars = new Set([")", "）", ",", "，", "。", "、", "；", ";", "！", "!", "？", "?", "】", "》", ">", '"', "'", "`", "."])

/**
 * Find HTTP(S) URLs in pasted share text.
 * Autolinker only answers which spans look like URLs. The WHATWG parser decides whether a span is a URL.
 */
export function detectUrls(input: string): readonly DetectedUrl[] {
  const normalized = normalizeUserInput(input)
  const detected: DetectedUrl[] = []
  const seen = new Set<string>()
  for (const match of Autolinker.parse(normalized, autolinkerOptions)) {
    if (match.getType() !== "url") continue
    pushUrl(detected, seen, match.getMatchedText())
  }
  if (detected.length > 0) return detected
  pushUrl(detected, seen, normalized.trim())
  return detected
}

function pushUrl(detected: DetectedUrl[], seen: Set<string>, candidate: string): void {
  const raw = trimCandidate(candidate)
  if (raw === undefined) return
  const url = httpUrl(raw)
  if (url === undefined || seen.has(url.href)) return
  seen.add(url.href)
  detected.push({ raw, url })
}

function trimCandidate(candidate: string): string | undefined {
  const start = findScheme(candidate)
  if (start < 0) return undefined
  let end = start
  while (end < candidate.length) {
    const char = candidate[end]
    if (char === undefined || !urlChars.has(char)) break
    end += 1
  }
  let raw = candidate.slice(start, end)
  while (raw.length > 0) {
    const last = raw[raw.length - 1]
    if (last === undefined || !trailingChars.has(last)) break
    raw = raw.slice(0, -1)
  }
  return raw.length === 0 ? undefined : raw
}

function findScheme(value: string): number {
  const lower = value.toLowerCase()
  const https = lower.indexOf("https://")
  const http = lower.indexOf("http://")
  if (https < 0) return http
  if (http < 0) return https
  return Math.min(https, http)
}

function httpUrl(raw: string): URL | undefined {
  if (!/^https?:\/\//i.test(raw)) return undefined
  try {
    const url = new URL(raw)
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
    if (url.hostname.length === 0) return undefined
    return url
  } catch {
    return undefined
  }
}
