import type { ExtractFailure, Extractor, Transport } from "@fetchr/core"
import { Effect } from "effect"
import { failure } from "./failure"
import { parseDetail, selectDetail } from "./parser"
import { match, resolveCanonical } from "./resolver"
import { feedRequest } from "./session"

function readBody(response: Response): Effect.Effect<string, ExtractFailure> {
  return Effect.tryPromise({
    try: () => response.text(),
    catch: () => failure("EXTRACTOR_BROKEN", "Douyin response body could not be read"),
  })
}

function matchedDetail(
  transport: Transport,
  id: string,
  requestFor: (id: string, attempt: 0 | 1) => Request,
): Effect.Effect<unknown, ExtractFailure> {
  return Effect.gen(function* () {
    for (const attempt of [0, 1] as const) {
      const response = yield* transport.request(requestFor(id, attempt))
      if (!response.ok) continue
      const text = yield* readBody(response)
      let payload: unknown
      try {
        payload = JSON.parse(text)
      } catch {
        continue
      }
      const detail = selectDetail(payload, id)
      if (detail !== undefined) return detail
    }
    return undefined
  })
}

export const douyinExtractor: Extractor = {
  platform: "douyin",
  match,
  extract(resource, transport) {
    return Effect.gen(function* () {
      const canonical = yield* resolveCanonical(resource, transport)
      const id = canonical.id
      if (id === undefined) {
        return yield* Effect.fail(
          failure("RESOLVE_FAILED", "Douyin video id is missing"),
        )
      }
      // Videos and image notes share the feed. When the primary host refuses or
      // does not return this work, ask the backup host. The feed misses only after both fail.
      const detail = yield* matchedDetail(transport, id, feedRequest)
      if (detail === undefined) {
        return yield* Effect.fail(
          failure("SOURCE_UNAVAILABLE", "Douyin feed did not include this work"),
        )
      }
      const post = yield* parseDetail(detail, canonical)
      // A modal_id link cannot tell video from image note. When the feed answers
      // with images, the canonical URL is the note form.
      if (
        !canonical.url.pathname.startsWith("/note/") &&
        post.media.some((asset) => asset.type === "image")
      ) {
        return { ...post, canonicalUrl: `https://www.douyin.com/note/${post.id}` }
      }
      return post
    })
  },
}
