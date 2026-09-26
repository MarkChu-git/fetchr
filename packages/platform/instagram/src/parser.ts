import type {
  Author,
  Delivery,
  ExtractFailure,
  ImageAsset,
  MediaAsset,
  MediaPost,
  VideoAsset,
} from "@fetchr/core"
import { Effect } from "effect"
import { failure } from "./failure"
import { InstagramPayload, type ShortcodeMedia } from "./schema"

// These CDNs reject a download that does not send Referer. Direct cannot
// attach that header, and the worker is what signs the proxy token.
const REFERRER_CDNS = ["cdninstagram.com", "fbcdn.net"] as const

function cdnRequiresReferer(url: string): boolean {
  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    return true
  }
  return REFERRER_CDNS.some(
    (cdn) => hostname === cdn || hostname.endsWith(`.${cdn}`),
  )
}

function deliveryFor(url: string): Delivery {
  if (cdnRequiresReferer(url)) {
    return { type: "proxy", token: "pending" }
  }
  return { type: "direct", url }
}

function imageFrom(
  id: string,
  source: {
    readonly display_url: string
    readonly dimensions?: {
      readonly width: number
      readonly height: number
    }
  },
): ImageAsset {
  const width = source.dimensions?.width
  const height = source.dimensions?.height
  return {
    type: "image",
    id,
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    delivery: deliveryFor(source.display_url),
  }
}

function videoFrom(media: {
  readonly shortcode: string
  readonly display_url: string
  readonly video_url: string
  readonly dimensions?: {
    readonly width: number
    readonly height: number
  }
}): VideoAsset {
  const width = media.dimensions?.width
  const height = media.dimensions?.height
  return {
    type: "video",
    id: media.shortcode,
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    thumbnail: media.display_url,
    delivery: deliveryFor(media.video_url),
  }
}

function assetsFrom(media: ShortcodeMedia): readonly MediaAsset[] {
  if (media.__typename === "GraphSidecar") {
    return media.edge_sidecar_to_children.edges.map((edge, index) =>
      imageFrom(`${media.shortcode}:${index + 1}`, edge.node),
    )
  }
  if (media.__typename === "GraphVideo") {
    return [videoFrom(media)]
  }
  return [imageFrom(media.shortcode, media)]
}

function authorFrom(
  owner:
    | {
        readonly username?: string
        readonly full_name?: string
      }
    | undefined,
): Author | undefined {
  if (owner === undefined) {
    return undefined
  }
  const username = owner.username
  const name = owner.full_name
  if (username === undefined && name === undefined) {
    return undefined
  }
  if (username === undefined) {
    if (name === undefined) {
      return undefined
    }
    return { name }
  }
  const profileUrl = `https://www.instagram.com/${encodeURIComponent(username)}/`
  if (name === undefined) {
    return { username, profileUrl }
  }
  return { username, name, profileUrl }
}

function descriptionFrom(media: {
  readonly edge_media_to_caption?: {
    readonly edges: ReadonlyArray<{
      readonly node: { readonly text: string }
    }>
  }
}): string | undefined {
  const text = media.edge_media_to_caption?.edges[0]?.node.text
  if (text === undefined || text.length === 0) {
    return undefined
  }
  return text
}

export function toMediaPost(
  payload: typeof InstagramPayload.Type,
  identity: { readonly id: string; readonly canonicalUrl: string },
): Effect.Effect<MediaPost, ExtractFailure> {
  if (!("shortcode_media" in payload)) {
    if (payload.message === "private_media") {
      return Effect.fail(
        failure("PRIVATE_MEDIA", "This Instagram post is private"),
      )
    }
    return Effect.fail(
      failure(
        "LOGIN_REQUIRED",
        "Instagram requires a login to view this post",
      ),
    )
  }

  const media = payload.shortcode_media
  if (media.shortcode !== identity.id) {
    return Effect.fail(
      failure(
        "RESOLVE_FAILED",
        "Instagram shortcode did not match the canonical URL",
      ),
    )
  }

  const author = authorFrom(media.owner)
  const description = descriptionFrom(media)
  const post: MediaPost = {
    platform: "instagram",
    id: identity.id,
    canonicalUrl: identity.canonicalUrl,
    media: assetsFrom(media),
    ...(author === undefined ? {} : { author }),
    ...(description === undefined ? {} : { description }),
  }
  return Effect.succeed(post)
}
