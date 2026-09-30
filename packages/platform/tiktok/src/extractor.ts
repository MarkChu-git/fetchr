import { Effect, Schema } from "effect"
import type { ExtractFailure, Extractor } from "@fetchr/core"
import { mediaPostFromTikTokPage, readRehydrationJson } from "./parser"
import { TikTokPageJson } from "./schema"

const videoPath = /^\/@[\w.-]+\/video\/\d+\/?$/
const shortPath = /^\/[A-Za-z0-9]+\/?$/

const matchTikTok = (url: URL): boolean => {
  const host = url.hostname
  if (host === "vm.tiktok.com") return shortPath.test(url.pathname)
  if (host === "www.tiktok.com" || host === "tiktok.com") {
    return videoPath.test(url.pathname)
  }
  return false
}

const decodePage = (body: string) => {
  const embedded = readRehydrationJson(body)
  if (embedded === undefined) {
    return Effect.fail<ExtractFailure>({
      code: "SCHEMA_CHANGED",
      message: "TikTok page is missing __UNIVERSAL_DATA_FOR_REHYDRATION__",
    })
  }
  return Schema.decodeUnknownEffect(TikTokPageJson)(embedded).pipe(
    Effect.mapError(
      (error): ExtractFailure => ({
        code: "SCHEMA_CHANGED",
        message: error.message,
      }),
    ),
  )
}

export const tiktokExtractor: Extractor = {
  platform: "tiktok",
  match: matchTikTok,
  extract: (resource, transport) =>
    Effect.gen(function* () {
      if (resource.platform !== "tiktok") {
        return yield* Effect.fail<ExtractFailure>({
          code: "UNSUPPORTED_URL",
          message: "TikTok extractor only accepts tiktok resources",
        })
      }
      const response = yield* transport.request(new Request(resource.url))
      if (!response.ok) {
        return yield* Effect.fail<ExtractFailure>({
          code: "SOURCE_UNAVAILABLE",
          message: `TikTok responded with HTTP ${response.status}`,
        })
      }
      const body = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: (): ExtractFailure => ({
          code: "SOURCE_UNAVAILABLE",
          message: "TikTok response body could not be read",
        }),
      })
      const page = yield* decodePage(body)
      const parsed = mediaPostFromTikTokPage(page, resource.url.href)
      if ("failure" in parsed) return yield* Effect.fail(parsed.failure)
      return parsed.post
    }),
}
