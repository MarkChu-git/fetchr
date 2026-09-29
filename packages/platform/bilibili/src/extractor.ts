import type {
  CanonicalResource,
  ExtractFailure,
  Extractor,
  MediaPost,
} from "@fetchr/core"
import { Effect } from "effect"
import { pageRequest, playRequest, shortRequest } from "./api"
import { failureForCode, notFound, readJson } from "./http"
import { bvidFromUrl, isBvid, matchBilibiliUrl } from "./match"
import { readVideoData } from "./page"
import { mediaPostFrom } from "./parser"
import { PlayEnvelope, ViewData, decodeUnknown } from "./schema"

function bvidOf(resource: CanonicalResource): string | undefined {
  const fromUrl = bvidFromUrl(resource.url)
  if (fromUrl !== undefined) return fromUrl
  if (resource.id !== undefined && isBvid(resource.id)) return resource.id
  return undefined
}

function isExtractFailure(
  value: MediaPost | ExtractFailure,
): value is ExtractFailure {
  return "code" in value
}

function requirePlay<T>(code: number, data: T | null) {
  const status = failureForCode(code)
  if (status !== undefined) return Effect.fail(status)
  if (data === null) return Effect.fail(notFound)
  return Effect.succeed(data)
}

function readPage(response: Response) {
  return Effect.tryPromise({
    try: async () => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      return response.text()
    },
    catch: () =>
      ({
        code: "SOURCE_UNAVAILABLE",
        message: "Bilibili page could not be read.",
      }) satisfies ExtractFailure,
  })
}

export const bilibiliExtractor = {
  platform: "bilibili",
  match: matchBilibiliUrl,
  extract: (resource, transport) =>
    Effect.gen(function* () {
      let bvid = bvidOf(resource)
      if (bvid === undefined) {
        // b23.tv matches without a BV id. Read the public redirect first, then open the watch page.
        const jump = yield* transport.request(shortRequest(resource.url))
        const location = jump.headers.get("location")
        if (location === null || location.length === 0) {
          return yield* Effect.fail({
            code: "RESOLVE_FAILED" as const,
            message: "Bilibili short link had no redirect.",
          })
        }
        bvid = bvidFromUrl(new URL(location, resource.url))
        if (bvid === undefined) {
          return yield* Effect.fail({
            code: "RESOLVE_FAILED" as const,
            message: "Bilibili short link did not redirect to a video.",
          })
        }
      }

      const pageResponse = yield* transport.request(pageRequest(bvid))
      const html = yield* readPage(pageResponse)
      const videoData = readVideoData(html)
      if (videoData === undefined || videoData === null) {
        return yield* Effect.fail(notFound)
      }
      const view = yield* decodeUnknown(ViewData, videoData)

      const playResponse = yield* transport.request(playRequest(bvid, view.cid))
      const playJson = yield* readJson(playResponse)
      const playEnvelope = yield* decodeUnknown(PlayEnvelope, playJson)
      const play = yield* requirePlay(playEnvelope.code, playEnvelope.data)

      const parsed = mediaPostFrom(bvid, view, play)
      if (isExtractFailure(parsed)) return yield* Effect.fail(parsed)
      return parsed
    }),
} satisfies Extractor
