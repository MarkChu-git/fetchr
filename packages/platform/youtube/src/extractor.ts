import { Effect, Schema } from "effect"
import type {
  CanonicalResource,
  ExtractFailure,
  Extractor,
  MediaPost,
  Transport,
} from "@fetchr/core"
import { isYoutubeVideoId, matchYoutubeUrl, videoIdFromUrl } from "./match.ts"
import { mediaPostFromPlayer } from "./parser.ts"
import { playerResponseJsonSchema } from "./schema.ts"

function failure(code: ExtractFailure["code"], message: string): ExtractFailure {
  return { code, message }
}

function videoIdFromResource(resource: CanonicalResource): string | undefined {
  if (resource.id !== undefined && isYoutubeVideoId(resource.id)) return resource.id
  return videoIdFromUrl(resource.url)
}

const readPlayer = Effect.fnUntraced(function* (
  resource: CanonicalResource,
  transport: Transport,
): Effect.fn.Return<MediaPost, ExtractFailure> {
  const id = videoIdFromResource(resource)
  if (id === undefined) {
    return yield* Effect.fail(
      failure("INVALID_URL", "YouTube URL has no video id."),
    )
  }

  // youtubei.js/cf-worker is not used. Its default evaluator throws, and its
  // Cache API stores non-URL keys, so it is not worker-safe. Transport must
  // return player-response JSON; this package does not call YouTube itself.
  const response = yield* transport.request(
    new Request(resource.url, {
      method: "GET",
      headers: { accept: "application/json" },
    }),
  )
  if (response.status === 404) {
    return yield* Effect.fail(
      failure("MEDIA_NOT_FOUND", "YouTube video was not found."),
    )
  }
  if (response.status === 429) {
    return yield* Effect.fail(
      failure("RATE_LIMITED", "YouTube rate limited the request."),
    )
  }
  if (!response.ok) {
    return yield* Effect.fail(
      failure(
        "SOURCE_UNAVAILABLE",
        `YouTube responded with HTTP ${response.status}.`,
      ),
    )
  }

  const text = yield* Effect.tryPromise({
    try: () => response.text(),
    catch: () =>
      failure("SOURCE_UNAVAILABLE", "YouTube response body could not be read."),
  })
  const player = yield* Schema.decodeUnknownEffect(playerResponseJsonSchema)(
    text,
  ).pipe(
    Effect.mapError((error) =>
      failure(
        "SCHEMA_CHANGED",
        `YouTube player response did not match the schema: ${error.message}`,
      ),
    ),
  )
  return yield* mediaPostFromPlayer(player, id)
})

export const youtubeExtractor: Extractor = {
  platform: "youtube",
  match: matchYoutubeUrl,
  extract: (resource, transport) =>
    readPlayer(resource, transport).pipe(
      Effect.catchDefect((defect) =>
        Effect.fail(
          failure(
            "EXTRACTOR_BROKEN",
            defect instanceof Error
              ? defect.message
              : "YouTube extractor failed.",
          ),
        ),
      ),
    ),
}
