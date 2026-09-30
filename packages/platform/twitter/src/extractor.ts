import { hostAllowed, type CanonicalResource, type ExtractFailure, type Extractor } from "@fetchr/core"
import { Effect, Schema } from "effect"
import { postFrom } from "./parser"
import { SyndicationResult } from "./schema"

const statusHosts = ["x.com", "www.x.com", "twitter.com", "www.twitter.com"] as const
const statusPath = /^\/[^/]+\/status\/\d+\/?$/
const SyndicationJson = Schema.fromJsonString(SyndicationResult)

function match(url: URL): boolean {
  return url.protocol === "https:" && hostAllowed(url.hostname, statusHosts) && statusPath.test(url.pathname)
}

function tweetId(resource: CanonicalResource): string | undefined {
  if (resource.id !== undefined && /^\d+$/.test(resource.id)) return resource.id
  const found = /\/status\/(\d+)/.exec(resource.url.pathname)
  return found?.[1]
}

// Public embed token. It is not a session and carries no cookie.
function syndicationToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "")
}

function syndicationRequest(id: string): Request {
  const url = new URL("https://cdn.syndication.twimg.com/tweet-result")
  url.searchParams.set("id", id)
  url.searchParams.set("lang", "en")
  url.searchParams.set("token", syndicationToken(id))
  return new Request(url, {
    method: "GET",
    headers: { accept: "application/json" },
  })
}

export const twitterExtractor: Extractor = {
  platform: "twitter",
  match,
  extract(resource, transport) {
    return Effect.gen(function* () {
      const id = tweetId(resource)
      if (id === undefined) {
        return yield* Effect.fail<ExtractFailure>({
          code: "INVALID_URL",
          message: "X status URL is missing a numeric id.",
        })
      }

      const response = yield* transport.request(syndicationRequest(id))
      if (!response.ok) {
        return yield* Effect.fail<ExtractFailure>({
          code: "SOURCE_UNAVAILABLE",
          message: "X did not return a tweet.",
        })
      }

      const text = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: (): ExtractFailure => ({
          code: "SOURCE_UNAVAILABLE",
          message: "X response could not be read.",
        }),
      })
      const decoded = yield* Schema.decodeUnknownEffect(SyndicationJson)(text).pipe(
        Effect.mapError(
          (): ExtractFailure => ({
            code: "SCHEMA_CHANGED",
            message: "X response did not match the expected schema.",
          }),
        ),
      )
      if (decoded.__typename === "TweetUnavailable") {
        if (decoded.reason === "NsfwLoggedOut") {
          return yield* Effect.fail<ExtractFailure>({
            code: "LOGIN_REQUIRED",
            message: "This post is visible after login.",
          })
        }
        if (decoded.reason === "Protected") {
          return yield* Effect.fail<ExtractFailure>({
            code: "PRIVATE_MEDIA",
            message: "This post is from a protected account.",
          })
        }
        return yield* Effect.fail<ExtractFailure>({
          code: "MEDIA_NOT_FOUND",
          message: "This post is not available.",
        })
      }
      return postFrom(decoded, resource)
    })
  },
}
