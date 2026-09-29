import type { ExtractFailure, Extractor, Transport } from "@fetchr/core"
import { Effect } from "effect"
import { failure } from "./failure"
import { parseDetail, selectDetail } from "./parser"
import { match, resolveCanonical } from "./resolver"
import { feedRequest, slidesRequest } from "./session"

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
): Effect.Effect<unknown | undefined, ExtractFailure> {
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
      // Image notes are not in the public video feed. A canonical /note/{id} asks slidesinfo only, and does not fetch the share page.
      if (canonical.url.pathname.startsWith("/note/")) {
        const detail = yield* matchedDetail(transport, id, slidesRequest)
        if (detail === undefined) {
          return yield* Effect.fail(
            failure("SOURCE_UNAVAILABLE", "Douyin slides did not include this note"),
          )
        }
        return yield* parseDetail(detail, canonical)
      }
      // When the primary host refuses or does not return this work, ask the backup host. The feed misses only after both fail.
      const detail = yield* matchedDetail(transport, id, feedRequest)
      if (detail !== undefined) return yield* parseDetail(detail, canonical)
      // A web share often carries only modal_id, which does not say video or image note. When the public video feed has no such item, ask once more as an image note.
      const note = yield* matchedDetail(transport, id, slidesRequest)
      if (note === undefined) {
        return yield* Effect.fail(
          failure("SOURCE_UNAVAILABLE", "Douyin feed did not include this video"),
        )
      }
      return yield* parseDetail(note, {
        ...canonical,
        url: new URL(`https://www.douyin.com/note/${id}`),
      })
    })
  },
}
