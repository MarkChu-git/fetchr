import { Effect } from "effect"
import type {
  CanonicalResource,
  ExtractFailure,
  Extractor,
  MediaPost,
  Transport,
} from "./index"

const invisible = /[\u200b\u200c\u200d\ufeff]/g

/**
 * Share text wraps a short link inside a sentence, so the whole paste is not a URL.
 * Zero-width characters split the address, so strip them first.
 * A phrase such as "copy this link" is often glued to the short link with no space. If those characters count as part of the address, no platform matches.
 */
function urlFromPaste(input: string): string | undefined {
  const match = input
    .replace(invisible, "")
    .match(/https?:\/\/[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+/i)
  const found = match?.[0]
  if (found === undefined) return undefined
  return found.replace(/[)）,，。、；;！!？?】》>"'`]+$/u, "")
}

/**
 * The only public extraction entry. The caller passes pasted text and a list of extractors.
 * Short-link following and page parsing stay inside each platform package.
 */
export function extract(
  url: string,
  transport: Transport,
  extractors: readonly Extractor[],
): Effect.Effect<MediaPost, ExtractFailure> {
  return Effect.gen(function* () {
    const parsed = yield* Effect.try({
      try: () => new URL(urlFromPaste(url) ?? url.trim()),
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
