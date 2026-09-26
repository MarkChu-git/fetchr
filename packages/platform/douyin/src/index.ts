import type { ExtractFailure, Extractor } from "@fetchr/core"
import { Effect } from "effect"
import { failure } from "./failure"
import { parseDetail } from "./parser"
import { detailRequest, match, resolveCanonical } from "./resolver"

function readJson(response: Response): Effect.Effect<unknown, ExtractFailure> {
  return Effect.gen(function* () {
    const text = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: () =>
        failure("EXTRACTOR_BROKEN", "Douyin detail body could not be read"),
    })
    return yield* Effect.try({
      try: () => {
        const value: unknown = JSON.parse(text)
        return value
      },
      catch: () => failure("SCHEMA_CHANGED", "Douyin detail body was not JSON"),
    })
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
      const response = yield* transport.request(detailRequest(id, Date.now()))
      if (!response.ok) {
        return yield* Effect.fail(
          failure("SOURCE_UNAVAILABLE", "Douyin detail request failed"),
        )
      }
      const payload = yield* readJson(response)
      return yield* parseDetail(payload, canonical)
    })
  },
}
