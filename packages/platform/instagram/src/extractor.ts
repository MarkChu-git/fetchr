import { hostAllowed, type Extractor } from "@fetchr/core"
import { Effect, Schema } from "effect"
import { failure } from "./failure"
import { toMediaPost } from "./parser"
import { InstagramPayload } from "./schema"

const POST_OR_REEL = /^\/(p|reel)\/([A-Za-z0-9_-]+)\/?$/
const PROFILE_REEL = /^\/[A-Za-z0-9._]+\/reel\/([A-Za-z0-9_-]+)\/?$/

function isInstagramHttps(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    hostAllowed(url.hostname, ["www.instagram.com", "instagram.com"])
  )
}

function identityOf(
  url: URL,
): { readonly id: string; readonly canonicalUrl: string } | undefined {
  const post = POST_OR_REEL.exec(url.pathname)
  const kind = post?.[1]
  const postId = post?.[2]
  if (postId !== undefined && (kind === "p" || kind === "reel")) {
    return {
      id: postId,
      canonicalUrl: `https://www.instagram.com/${kind}/${postId}/`,
    }
  }
  const profileId = PROFILE_REEL.exec(url.pathname)?.[1]
  if (profileId !== undefined) {
    return {
      id: profileId,
      canonicalUrl: `https://www.instagram.com/reel/${profileId}/`,
    }
  }
  return undefined
}

function match(url: URL): boolean {
  return isInstagramHttps(url) && identityOf(url) !== undefined
}

function parseJson(text: string): unknown {
  return JSON.parse(text)
}

export const instagramExtractor: Extractor = {
  platform: "instagram",
  match,
  extract(resource, transport) {
    return Effect.gen(function* () {
      const identity =
        resource.platform === "instagram" && isInstagramHttps(resource.url)
          ? identityOf(resource.url)
          : undefined
      if (identity === undefined) {
        return yield* Effect.fail(
          failure(
            "UNSUPPORTED_URL",
            "URL is not a public Instagram post or reel",
          ),
        )
      }
      const response = yield* transport.request(
        new Request(resource.url, {
          method: "GET",
          headers: { accept: "application/json" },
        }),
      )
      const text = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: () =>
          failure(
            "SOURCE_UNAVAILABLE",
            "Instagram response could not be read",
          ),
      })
      const json = yield* Effect.try({
        try: () => parseJson(text),
        catch: () =>
          failure("SCHEMA_CHANGED", "Instagram payload was not JSON"),
      })
      const decoded = yield* Effect.mapError(
        Schema.decodeUnknownEffect(InstagramPayload)(json),
        () =>
          failure(
            "SCHEMA_CHANGED",
            "Instagram payload did not match the expected document",
          ),
      )
      return yield* toMediaPost(decoded, identity)
    })
  },
}
