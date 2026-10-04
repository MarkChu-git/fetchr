import { hostAllowed, type Extractor } from "@fetchr/core"
import { Effect, Schema } from "effect"
import { failure } from "./failure"
import { toCrawlerMediaPost, toMediaPost } from "./parser"
import { CrawlerMedia, InstagramPayload } from "./schema"

const POST_OR_REEL = /^\/(p|reel)\/([A-Za-z0-9_-]+)\/?$/
const PROFILE_REEL = /^\/[A-Za-z0-9._]+\/reel\/([A-Za-z0-9_-]+)\/?$/

const CRAWLER_UA =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 " +
  "Safari/604.1"

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

const ENTITIES: ReadonlyArray<readonly [RegExp, string]> = [
  [/&quot;|&#34;|&#x22;/gi, '"'],
  [/&#x27;|&#39;/g, "'"],
  [/&#x2F;/g, "/"],
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&amp;/g, "&"],
]

function unescapeEntities(text: string): string {
  let out = text
  for (const [re, rep] of ENTITIES) out = out.replace(re, rep)
  return out
}

function scriptJsonPayloads(html: string): readonly unknown[] {
  const out: unknown[] = []
  const re = /<script[^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const body = m[1]
    if (body === undefined || !body.includes("xig_polaris_media")) continue
    try {
      out.push(JSON.parse(body))
    } catch {
      // Server-rendered payloads are often entity-encoded; retry decoded.
      try {
        out.push(JSON.parse(unescapeEntities(body)))
      } catch {
        // Not every matching script is the JSON payload; keep looking.
      }
    }
  }
  return out
}

type CrawlerHit =
  | { readonly kind: "media"; readonly media: unknown }
  | { readonly kind: "gated" }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function findPolarisMedia(node: unknown): CrawlerHit | undefined {
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findPolarisMedia(item)
      if (hit !== undefined) return hit
    }
    return undefined
  }
  if (!isRecord(node)) return undefined
  const polaris = node["xig_polaris_media"]
  if (isRecord(polaris)) {
    const media = polaris["if_not_gated_logged_out"]
    if (isRecord(media)) return { kind: "media", media }
    if ("if_gated_logged_out" in polaris) return { kind: "gated" }
  }
  for (const value of Object.values(node)) {
    const hit = findPolarisMedia(value)
    if (hit !== undefined) return hit
  }
  return undefined
}

const CONTEXT_JSON = /"contextJSON"\s*:\s*"((?:[^"\\]|\\.)*)"/

function embedPayload(html: string): unknown {
  const m = CONTEXT_JSON.exec(unescapeEntities(html))
  if (m === null || m[1] === undefined) return undefined
  try {
    const inner: unknown = JSON.parse(`"${m[1]}"`)
    if (typeof inner !== "string") return undefined
    const ctx: unknown = JSON.parse(inner)
    if (!isRecord(ctx)) return undefined
    return ctx["gql_data"]
  } catch {
    return undefined
  }
}

function fetchPage(
  transport: Parameters<Extractor["extract"]>[1],
  url: string,
  ua: string,
) {
  return Effect.flatMap(
    transport.request(
      new Request(url, {
        method: "GET",
        headers: {
          accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
          "user-agent": ua,
        },
      }),
    ),
    (response) =>
      Effect.map(
        Effect.tryPromise({
          try: () => response.text(),
          catch: () =>
            failure(
              "SOURCE_UNAVAILABLE",
              "Instagram response could not be read",
            ),
        }),
        (text) => ({ status: response.status, text }),
      ),
  )
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

      // Anonymous path 1: the logged-out post page served to web crawlers
      // carries the full xig_polaris_media object, including the original
      // video rendition that logged-out browsers never see.
      const page = yield* fetchPage(transport, identity.canonicalUrl, CRAWLER_UA)
      if (page.status === 429) {
        return yield* Effect.fail(
          failure("RATE_LIMITED", "Instagram throttled the request"),
        )
      }
      if (page.status === 404) {
        return yield* Effect.fail(
          failure("MEDIA_NOT_FOUND", "Instagram post not found"),
        )
      }
      if (page.status >= 400) {
        return yield* Effect.fail(
          failure("SOURCE_UNAVAILABLE", "Instagram post page failed"),
        )
      }
      let gated = false
      for (const payload of scriptJsonPayloads(page.text)) {
        const hit = findPolarisMedia(payload)
        if (hit === undefined) continue
        if (hit.kind === "gated") {
          gated = true
          continue
        }
        // The page can embed media for other posts (author timeline); only a
        // matching shortcode is ours. Others are skipped before decoding.
        const code = isRecord(hit.media) ? hit.media["code"] : undefined
        if (code !== identity.id) continue
        const decoded = yield* Effect.mapError(
          Schema.decodeUnknownEffect(CrawlerMedia)(hit.media),
          () =>
            failure(
              "SCHEMA_CHANGED",
              "Instagram crawler payload did not match the expected document",
            ),
        )
        return yield* toCrawlerMediaPost(decoded, identity)
      }

      // Anonymous path 2: the embed page still exposes gql_data, but its
      // video_url is missing for licensed-audio reels.
      const embed = yield* fetchPage(
        transport,
        `https://www.instagram.com/p/${identity.id}/embed`,
        MOBILE_UA,
      )
      if (embed.status === 429) {
        return yield* Effect.fail(
          failure("RATE_LIMITED", "Instagram throttled the request"),
        )
      }
      if (embed.status >= 500) {
        return yield* Effect.fail(
          failure("SOURCE_UNAVAILABLE", "Instagram embed page failed"),
        )
      }
      const gql =
        embed.status >= 200 && embed.status < 300
          ? embedPayload(embed.text)
          : undefined
      if (gql !== undefined) {
        const decoded = yield* Effect.mapError(
          Schema.decodeUnknownEffect(InstagramPayload)(gql),
          () =>
            failure(
              "SCHEMA_CHANGED",
              "Instagram embed payload did not match the expected document",
            ),
        )
        return yield* toMediaPost(decoded, identity)
      }
      if (gated) {
        return yield* Effect.fail(
          failure(
            "LOGIN_REQUIRED",
            "Instagram requires a login to view this post",
          ),
        )
      }
      if (page.text.includes('property="og:image"')) {
        return yield* Effect.fail(
          failure(
            "PRIVATE_MEDIA",
            "This Instagram post is not available anonymously",
          ),
        )
      }
      return yield* Effect.fail(
        failure("MEDIA_NOT_FOUND", "Instagram post not found"),
      )
    })
  },
}
