import type { TikTokContentHint } from "./matcher"
import { tiktokContentHint } from "./matcher"

export interface TikTokFetchDiagnostic {
  readonly inputUrl: string
  readonly resolvedUrl: string
  readonly status: number
  readonly contentType: string | null
  readonly bodyLength: number
  readonly hasUniversalData: boolean
  readonly hasSigiState: boolean
  readonly contentTypeHint: TikTokContentHint
}

const challengeMarkers = [
  "captcha",
  "verify you are human",
  "wafchallenge",
  "access denied",
  "please enable javascript",
]

export function diagnoseTikTokFetch(
  input: URL,
  resolved: URL,
  status: number,
  contentType: string | null,
  body: string,
): TikTokFetchDiagnostic {
  return {
    inputUrl: input.href,
    resolvedUrl: resolved.href,
    status,
    contentType,
    bodyLength: new TextEncoder().encode(body).byteLength,
    hasUniversalData: body.includes("__UNIVERSAL_DATA_FOR_REHYDRATION__"),
    hasSigiState: body.includes("SIGI_STATE"),
    contentTypeHint: tiktokContentHint(resolved),
  }
}

/**
 * A challenge page is a block. A short HTML body is only a diagnostic:
 * length alone does not decide the error.
 */
export function isBlockedTikTokResponse(
  status: number,
  body: string,
  hasUniversalData: boolean,
): boolean {
  if (hasUniversalData) return false
  if (status === 401 || status === 403 || status === 429) return true
  const sample = body.slice(0, 16_000).toLowerCase()
  return challengeMarkers.some((marker) => sample.includes(marker))
}

export function isHtmlContent(contentType: string | null): boolean {
  if (contentType === null) return true
  const type = contentType.split(";")[0]?.trim().toLowerCase() ?? ""
  return type.length === 0 || type === "text/html" || type === "application/xhtml+xml"
}
