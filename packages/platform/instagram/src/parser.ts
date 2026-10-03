import {
  hostAllowed,
  unsignedProxy,
  type Author,
  type Delivery,
  type ExtractFailure,
  type ImageAsset,
  type MediaAsset,
  type MediaPost,
  type VideoAsset,
} from "@fetchr/core"
import { Effect } from "effect"
import { failure } from "./failure"
import type { CrawlerMedia } from "./schema"
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
  return hostAllowed(hostname, REFERRER_CDNS)
}

function deliveryFor(url: string): Delivery {
  if (cdnRequiresReferer(url)) {
    return unsignedProxy(url, { Referer: "https://www.instagram.com/" })
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

function assetsFrom(
  media: ShortcodeMedia,
): Effect.Effect<readonly MediaAsset[], ExtractFailure> {
  if (media.__typename === "GraphSidecar") {
    return Effect.succeed(
      media.edge_sidecar_to_children.edges.flatMap((edge, index): MediaAsset[] => {
        const node = edge.node
        const id = `${media.shortcode}:${index + 1}`
        if (node.__typename === "GraphVideo" && node.video_url !== undefined) {
          const asset: VideoAsset = {
            type: "video",
            id,
            ...(node.dimensions?.width === undefined
              ? {}
              : { width: node.dimensions.width }),
            ...(node.dimensions?.height === undefined
              ? {}
              : { height: node.dimensions.height }),
            thumbnail: node.display_url,
            delivery: deliveryFor(node.video_url),
          }
          return [asset]
        }
        return [imageFrom(id, node)]
      }),
    )
  }
  if (media.__typename === "GraphVideo") {
    if (media.video_url === undefined) {
      // Licensed-audio reels omit video_url from embeds served to logged-out
      // clients; only the crawler page exposes those renditions.
      return Effect.fail(
        failure(
          "LOGIN_REQUIRED",
          "Instagram hides this reel's video behind a login",
        ),
      )
    }
    return Effect.succeed([videoFrom({ ...media, video_url: media.video_url })])
  }
  return Effect.succeed([imageFrom(media.shortcode, media)])
}

function authorFrom(
  owner:
    | {
        readonly username?: string
        readonly full_name?: string
        readonly profile_pic_url?: string
      }
    | undefined,
): Author | undefined {
  if (owner === undefined) {
    return undefined
  }
  const username = owner.username
  const name = owner.full_name
  const avatar = owner.profile_pic_url
  if (username === undefined && name === undefined) {
    return undefined
  }
  const base =
    username === undefined
      ? name === undefined
        ? undefined
        : { name }
      : {
          username,
          profileUrl: `https://www.instagram.com/${encodeURIComponent(username)}/`,
          ...(name === undefined ? {} : { name }),
        }
  if (base === undefined) {
    return undefined
  }
  return { ...base, ...(avatar === undefined ? {} : { avatar }) }
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

  return Effect.map(assetsFrom(media), (mediaAssets) => {
    const author = authorFrom(media.owner)
    const description = descriptionFrom(media)
    const post: MediaPost = {
      platform: "instagram",
      id: identity.id,
      canonicalUrl: identity.canonicalUrl,
      media: mediaAssets,
      ...(author === undefined ? {} : { author }),
      ...(description === undefined ? {} : { description }),
    }
    return post
  })
}

// ── Crawler payload → MediaPost ─────────────────────────────────────

function crawlerImageAsset(
  id: string,
  media: {
    readonly original_width?: number
    readonly original_height?: number
    readonly image_versions2: {
      readonly candidates: ReadonlyArray<{
        readonly url: string
        readonly width?: number
        readonly height?: number
      }>
    }
  },
): ImageAsset {
  // Candidates arrive largest-first; width/height are absent on image posts.
  const best = media.image_versions2.candidates.reduce((a, b) =>
    (a.width ?? 0) * (a.height ?? 0) >= (b.width ?? 0) * (b.height ?? 0)
      ? a
      : b,
  )
  return {
    type: "image",
    id,
    ...(media.original_width === undefined
      ? best.width === undefined
        ? {}
        : { width: best.width }
      : { width: media.original_width }),
    ...(media.original_height === undefined
      ? best.height === undefined
        ? {}
        : { height: best.height }
      : { height: media.original_height }),
    delivery: deliveryFor(best.url),
  }
}

function crawlerVideoAsset(
  id: string,
  media: Extract<CrawlerMedia, { __typename: "XIGPolarisVideoMedia" }>,
): VideoAsset {
  const url = media.video_versions[0].url
  const thumbnail = media.image_versions2?.candidates.reduce((a, b) =>
    (a.width ?? 0) * (a.height ?? 0) >= (b.width ?? 0) * (b.height ?? 0)
      ? a
      : b,
  )
  return {
    type: "video",
    id,
    ...(media.original_width === undefined
      ? {}
      : { width: media.original_width }),
    ...(media.original_height === undefined
      ? {}
      : { height: media.original_height }),
    ...(thumbnail === undefined ? {} : { thumbnail: thumbnail.url }),
    delivery: deliveryFor(url),
  }
}

function crawlerAssetsFrom(media: CrawlerMedia): readonly MediaAsset[] {
  if (media.__typename === "XIGPolarisCarouselMedia") {
    return media.carousel_media.map((child, index) => {
      const id = `${media.code}:${index + 1}`
      return child.__typename === "XIGPolarisVideoMedia"
        ? crawlerVideoAsset(id, child)
        : crawlerImageAsset(id, child)
    })
  }
  if (media.__typename === "XIGPolarisVideoMedia") {
    return [crawlerVideoAsset(media.code, media)]
  }
  return [crawlerImageAsset(media.code, media)]
}

export function toCrawlerMediaPost(
  media: CrawlerMedia,
  identity: { readonly id: string; readonly canonicalUrl: string },
): Effect.Effect<MediaPost, ExtractFailure> {
  if (media.code !== identity.id) {
    return Effect.fail(
      failure(
        "RESOLVE_FAILED",
        "Instagram shortcode did not match the canonical URL",
      ),
    )
  }
  const author = authorFrom(media.user)
  const description =
    media.caption === undefined || media.caption === null
      ? undefined
      : media.caption.text.length === 0
        ? undefined
        : media.caption.text
  const publishedAt =
    media.taken_at === undefined
      ? undefined
      : new Date(media.taken_at * 1000).toISOString()
  const post: MediaPost = {
    platform: "instagram",
    id: identity.id,
    canonicalUrl: identity.canonicalUrl,
    media: crawlerAssetsFrom(media),
    ...(author === undefined ? {} : { author }),
    ...(description === undefined ? {} : { description }),
    ...(publishedAt === undefined ? {} : { publishedAt }),
  }
  return Effect.succeed(post)
}
