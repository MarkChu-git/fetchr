import {
  unsignedProxy,
  type ExtractFailure,
  type MediaPost,
  type VideoAsset,
} from "@fetchr/core"
import { tiktokFailure } from "./errors"
import type { TikTokPage } from "./schema"

const rehydrationId = "__UNIVERSAL_DATA_FOR_REHYDRATION__"
const rehydrationSelector = `script#${rehydrationId}`
// 10216 is a private post. 10222 is a private account. Neither returns media.
const privateStatusCodes = new Set([10216, 10222])

export type ScriptExtraction =
  | { readonly status: "not-found" }
  | { readonly status: "empty" }
  | { readonly status: "invalid-json" }
  | { readonly status: "json"; readonly value: unknown }

interface RewriterTextChunk {
  readonly text: string
}

interface RewriterHandlers {
  element?: () => void
  text?: (chunk: RewriterTextChunk) => void
}

interface HtmlRewriterInstance {
  on(selector: string, handlers: RewriterHandlers): HtmlRewriterInstance
  transform(response: Response): Response
}

interface HtmlRewriterConstructor {
  new (): HtmlRewriterInstance
}

/**
 * Read the rehydration script.
 * On runtimes that provide HTMLRewriter, that parser is the primary path.
 * The balanced scanner runs only when HTMLRewriter itself is unavailable.
 */
export async function readRehydration(html: string): Promise<ScriptExtraction> {
  if (htmlRewriterConstructor() !== undefined) {
    try {
      return await readWithHtmlRewriter(html)
    } catch {
      // HTMLRewriter could not read this document. The scanner below is the fallback.
    }
  }
  return scanRehydration(html)
}

/** Cross-runtime fallback. It tracks strings and escapes so braces inside JSON text are not object boundaries. */
export function scanRehydration(html: string): ScriptExtraction {
  const at = html.indexOf(rehydrationId)
  if (at < 0) return { status: "not-found" }
  const rest = html.slice(at + rehydrationId.length)
  // The marker sits in the opening tag. Skip to the tag's end so `">` is not treated as script text.
  const tagEnd = rest.indexOf(">")
  const body = tagEnd < 0 ? rest : rest.slice(tagEnd + 1)
  const closeAt = indexOfScriptClose(body)
  const region = closeAt < 0 ? body : body.slice(0, closeAt)
  const brace = region.indexOf("{")
  if (brace < 0) {
    return region.trim().length === 0 ? { status: "empty" } : { status: "invalid-json" }
  }
  const json = sliceJsonObject(region, brace)
  if (json === undefined) return { status: "invalid-json" }
  return classifyPayload(json)
}

/** Join every text chunk. HTMLRewriter does not promise that one callback holds the whole script. */
export function rehydrationFromParts(
  found: boolean,
  chunks: readonly string[],
): ScriptExtraction {
  if (!found) return { status: "not-found" }
  return classifyPayload(chunks.join(""))
}

export const mediaPostFromTikTokPage = (
  page: TikTokPage,
  canonicalUrl: string,
): { readonly post: MediaPost } | { readonly failure: ExtractFailure } => {
  const detail = page.__DEFAULT_SCOPE__["webapp.video-detail"]
  if (detail === undefined) {
    return {
      failure: tiktokFailure(
        "SCHEMA_CHANGED",
        "TikTok page data does not match the expected shape",
      ),
    }
  }
  if (privateStatusCodes.has(detail.statusCode)) {
    return {
      failure: {
        code: "PRIVATE_MEDIA",
        message: "TikTok post is private",
      },
    }
  }

  const item = detail.itemInfo?.itemStruct
  if (detail.statusCode !== 0) {
    return {
      failure: {
        code: "MEDIA_NOT_FOUND",
        message: `TikTok video is unavailable (status ${detail.statusCode})`,
      },
    }
  }
  const playAddr = item?.video?.playAddr
  if (item === undefined || playAddr === undefined || playAddr.length === 0) {
    return {
      failure: tiktokFailure("MEDIA_DATA_NOT_FOUND", "TikTok item has no playable media"),
    }
  }
  const cover = item.video?.cover
  // TikTok's CDN expects a tiktok.com Referer, which the browser cannot set. Leave signing to the Worker.
  const video: VideoAsset = {
    type: "video",
    id: item.id,
    delivery: unsignedProxy(playAddr, {
      Referer: "https://www.tiktok.com/",
    }),
    ...(cover !== undefined ? { thumbnail: cover } : {}),
    ...(item.video?.width !== undefined ? { width: item.video.width } : {}),
    ...(item.video?.height !== undefined ? { height: item.video.height } : {}),
  }

  const post: MediaPost = {
    platform: "tiktok",
    id: item.id,
    canonicalUrl,
    author: {
      id: item.author.id,
      name: item.author.nickname,
      username: item.author.uniqueId,
      ...(item.author.avatarThumb !== undefined ? { avatar: item.author.avatarThumb } : {}),
    },
    description: item.desc,
    ...(cover !== undefined ? { thumbnail: cover } : {}),
    media: [video],
  }
  return { post }
}

async function readWithHtmlRewriter(html: string): Promise<ScriptExtraction> {
  const Rewriter = htmlRewriterConstructor()
  if (Rewriter === undefined) return { status: "not-found" }
  const chunks: string[] = []
  let found = false
  const rewriter = new Rewriter().on(rehydrationSelector, {
    element() {
      found = true
    },
    text(chunk) {
      chunks.push(chunk.text)
    },
  })
  // Handlers run only while the transformed body is consumed.
  await rewriter.transform(new Response(html)).text()
  return rehydrationFromParts(found, chunks)
}

function htmlRewriterConstructor(): HtmlRewriterConstructor | undefined {
  const candidate: unknown = Reflect.get(globalThis, "HTMLRewriter")
  return isHtmlRewriterConstructor(candidate) ? candidate : undefined
}

function isHtmlRewriterConstructor(value: unknown): value is HtmlRewriterConstructor {
  return typeof value === "function"
}

function classifyPayload(raw: string): ScriptExtraction {
  const trimmed = raw.trim().replace(/^\uFEFF/, "")
  if (trimmed.length === 0) return { status: "empty" }
  try {
    return { status: "json", value: parseJson(trimmed) }
  } catch {
    return { status: "invalid-json" }
  }
}

function parseJson(text: string): unknown {
  return JSON.parse(text) as unknown
}

function sliceJsonObject(source: string, start: number): string | undefined {
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < source.length; index += 1) {
    const char = source[index]
    if (char === undefined) return undefined
    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === "\\") {
        escaped = true
        continue
      }
      if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === "{") depth += 1
    if (char === "}") {
      depth -= 1
      if (depth === 0) return source.slice(start, index + 1)
    }
  }
  return undefined
}

function indexOfScriptClose(source: string): number {
  const needle = "</script"
  for (let index = 0; index <= source.length - needle.length; index += 1) {
    if (!startsWithIgnoreCase(source, needle, index)) continue
    let cursor = index + needle.length
    while (cursor < source.length && isHtmlSpace(source[cursor])) cursor += 1
    if (source[cursor] === ">") return index
  }
  return -1
}

function startsWithIgnoreCase(source: string, needle: string, index: number): boolean {
  for (let offset = 0; offset < needle.length; offset += 1) {
    const left = source[index + offset]
    const right = needle[offset]
    if (left === undefined || right === undefined) return false
    if (left.toLowerCase() !== right) return false
  }
  return true
}

function isHtmlSpace(char: string | undefined): boolean {
  return char === " " || char === "\n" || char === "\r" || char === "\t" || char === "\f"
}
