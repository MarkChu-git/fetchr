import type {
  CanonicalResource,
  ExtractFailure,
  Extractor,
  MediaPost,
} from "@fetchr/core"
import { Effect } from "effect"
import { playRequest, viewRequest } from "./api"
import { failureForCode, notFound, readJson } from "./http"
import { bvidFromUrl, isBvid, matchBilibiliUrl } from "./match"
import { mediaPostFrom } from "./parser"
import { PlayEnvelope, ViewEnvelope, decodeUnknown } from "./schema"

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

function requireData<T>(code: number, data: T | null) {
  const status = failureForCode(code)
  if (status !== undefined) return Effect.fail(status)
  if (data === null) return Effect.fail(notFound)
  return Effect.succeed(data)
}

export const bilibiliExtractor = {
  platform: "bilibili",
  match: matchBilibiliUrl,
  extract: (resource, transport) =>
    Effect.gen(function* () {
      const bvid = bvidOf(resource)
      if (bvid === undefined) {
        return yield* Effect.fail({
          code: "UNSUPPORTED_URL" as const,
          message: "Not a bilibili video URL.",
        })
      }

      const viewResponse = yield* transport.request(viewRequest(bvid))
      const viewJson = yield* readJson(viewResponse)
      const viewEnvelope = yield* decodeUnknown(ViewEnvelope, viewJson)
      const view = yield* requireData(viewEnvelope.code, viewEnvelope.data)

      const playResponse = yield* transport.request(playRequest(bvid, view.cid))
      const playJson = yield* readJson(playResponse)
      const playEnvelope = yield* decodeUnknown(PlayEnvelope, playJson)
      const play = yield* requireData(playEnvelope.code, playEnvelope.data)

      const parsed = mediaPostFrom(bvid, view, play)
      if (isExtractFailure(parsed)) return yield* Effect.fail(parsed)
      return parsed
    }),
} satisfies Extractor
