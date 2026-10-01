import type { ExtractFailure, Extractor, Transport } from "@fetchr/core"
import { Effect } from "effect"
import { createDetailSource, detailHasImages } from "./detail"
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

// One signed detail source per module instance: its ttwid cookie is cached for a day.
const webDetail = createDetailSource()

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
      // Image notes are not in the public video feed. A canonical /note/{id} asks the signed web detail directly.
      if (canonical.url.pathname.startsWith("/note/")) {
        const detail = yield* webDetail(id, transport)
        return yield* parseDetail(detail, canonical)
      }
      // When the primary host refuses or does not return this work, ask the backup host. The feed misses only after both fail.
      const detail = yield* matchedDetail(transport, id, feedRequest)
      if (detail !== undefined) return yield* parseDetail(detail, canonical)
      // The feed missed the work. The signed web detail decides whether it is gone or the feed skipped it.
      // A web share often carries only modal_id, which does not say video or image note; the detail answers that.
      const fallback = yield* webDetail(id, transport)
      const fallbackCanonical = detailHasImages(fallback)
        ? { ...canonical, url: new URL(`https://www.douyin.com/note/${id}`) }
        : canonical
      return yield* parseDetail(fallback, fallbackCanonical)
    })
  },
}
