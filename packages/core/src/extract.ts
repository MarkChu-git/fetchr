import { Effect } from "effect"
import type {
  CanonicalResource,
  ExtractFailure,
  Extractor,
  MediaPost,
  Transport,
} from "./index"
import { detectUrls } from "./input/detect-urls"

/**
 * The only public extraction entry. The caller passes pasted text and a list of extractors.
 * URL detection stops at the shared input layer. Short-link following and page parsing stay inside each platform package.
 */
export function extract(
  url: string,
  transport: Transport,
  extractors: readonly Extractor[],
): Effect.Effect<MediaPost, ExtractFailure> {
  return Effect.gen(function* () {
    const detected = detectUrls(url)
    if (detected.length === 0) {
      return yield* Effect.fail<ExtractFailure>({
        code: "INVALID_URL",
        message: "URL is not valid",
      })
    }
    for (const candidate of detected) {
      const extractor = extractors.find((item) => item.match(candidate.url))
      if (extractor === undefined) continue
      const resource: CanonicalResource = {
        platform: extractor.platform,
        url: candidate.url,
      }
      return yield* extractor.extract(resource, transport)
    }
    return yield* Effect.fail<ExtractFailure>({
      code: "UNSUPPORTED_URL",
      message: "No extractor matches this URL",
    })
  })
}
