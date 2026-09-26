import type { CanonicalResource, ExtractFailure, Extractor, MediaPost, Transport } from "@fetchr/core"
import { Effect, Schema } from "effect"

import { failure } from "./errors"
import { readEmbeddedJson, toMediaPost } from "./parser"
import {
  canonicalExploreUrl,
  exploreId,
  isShortLink,
  match,
  resolveShortLink,
} from "./resolver"
import { embeddedStateFromJson } from "./schema"
import { pageRequest } from "./session"

const readBody = (response: Response) =>
  Effect.tryPromise({
    try: () => response.text(),
    catch: () => failure("SOURCE_UNAVAILABLE", "Could not read the page."),
  })

const resolvePayload = (payload: string) =>
  Effect.try({
    try: () => resolveShortLink(payload),
    catch: () => failure("RESOLVE_FAILED", "The link did not resolve to an explore URL."),
  })

const resolveResource = (
  resource: CanonicalResource,
  transport: Transport,
): Effect.Effect<CanonicalResource, ExtractFailure> =>
  Effect.gen(function* () {
    if (isShortLink(resource.url)) {
      const response = yield* transport.request(pageRequest(resource.url))
      const location = response.headers.get("location")
      if (location !== null && location.length > 0) {
        return yield* resolvePayload(location)
      }
      if (!response.ok) {
        return yield* Effect.fail(failure("RESOLVE_FAILED", "The link did not resolve."))
      }
      const html = yield* readBody(response)
      return yield* resolvePayload(html)
    }

    const id = exploreId(resource.url)
    if (id === undefined) {
      return yield* Effect.fail(
        failure("UNSUPPORTED_URL", "The URL is not a Xiaohongshu explore or short link."),
      )
    }
    return {
      platform: "xiaohongshu",
      id,
      url: canonicalExploreUrl(id),
    }
  })

const extract = (
  resource: CanonicalResource,
  transport: Transport,
): Effect.Effect<MediaPost, ExtractFailure> =>
  Effect.gen(function* () {
    const canonical = yield* resolveResource(resource, transport)
    const response = yield* transport.request(pageRequest(canonical.url))
    if (!response.ok) {
      return yield* Effect.fail(failure("SOURCE_UNAVAILABLE", "The page request failed."))
    }
    const html = yield* readBody(response)
    const json = readEmbeddedJson(html)
    if (json === undefined) {
      return yield* Effect.fail(failure("SCHEMA_CHANGED", "Embedded state is missing."))
    }
    const state = yield* Effect.mapError(
      Schema.decodeUnknownEffect(embeddedStateFromJson)(json),
      () => failure("SCHEMA_CHANGED", "Embedded state did not match the expected shape."),
    )
    return yield* toMediaPost(state, canonical)
  })

export const xiaohongshuExtractor = {
  platform: "xiaohongshu",
  match,
  extract,
} satisfies Extractor
