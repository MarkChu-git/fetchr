import { Effect } from "effect"
import type {
  CanonicalResource,
  ExtractFailure,
  Extractor,
  MediaPost,
  Transport,
} from "./index"

export function extract(
  url: string,
  transport: Transport,
  extractors: readonly Extractor[],
): Effect.Effect<MediaPost, ExtractFailure> {
  return Effect.gen(function* () {
    const parsed = yield* Effect.try({
      try: () => new URL(url),
      catch: (): ExtractFailure => ({
        code: "INVALID_URL",
        message: "URL is not valid",
      }),
    })
    const extractor = extractors.find((candidate) => candidate.match(parsed))
    if (extractor === undefined) {
      return yield* Effect.fail<ExtractFailure>({
        code: "UNSUPPORTED_URL",
        message: "No extractor matches this URL",
      })
    }
    const resource: CanonicalResource = {
      platform: extractor.platform,
      url: parsed,
    }
    return yield* extractor.extract(resource, transport)
  })
}
