import type {
  Author,
  CanonicalResource,
  Delivery,
  ImageAsset,
  MediaAsset,
  MediaPost,
  VideoAsset,
} from "@fetchr/core"
import { deliveryFor } from "./delivery"
import type { TweetPayload } from "./schema"

type Variant = NonNullable<TweetPayload["video"]>["variants"][number]
type MediaDetail = NonNullable<TweetPayload["mediaDetails"]>[number]

export function postFrom(tweet: TweetPayload, resource: CanonicalResource): MediaPost {
  const media = mediaFrom(tweet)
  const author = authorFrom(tweet.user)
  const post: {
    platform: "twitter"
    id: string
    canonicalUrl: string
    media: readonly MediaAsset[]
    author?: Author
    description?: string
    thumbnail?: string
    publishedAt?: string
  } = {
    platform: "twitter",
    id: tweet.id_str,
    canonicalUrl: resource.url.href,
    media,
  }
  if (author !== undefined) post.author = author
  if (tweet.text !== undefined) post.description = tweet.text
  if (tweet.created_at !== undefined) post.publishedAt = tweet.created_at
  const thumbnail = coverFrom(media)
  if (thumbnail !== undefined) post.thumbnail = thumbnail
  return post
}

function mediaFrom(tweet: TweetPayload): readonly MediaAsset[] {
  const assets: MediaAsset[] = []
  const details = tweet.mediaDetails ?? []
  for (let index = 0; index < details.length; index++) {
    const detail = details[index]
    if (detail === undefined) continue
    const asset = assetFromDetail(tweet.id_str, detail, index)
    if (asset !== undefined) assets.push(asset)
  }
  const hasVideo = assets.some((asset) => asset.type === "video")
  if (!hasVideo && tweet.video !== undefined) {
    const asset = videoFromVariants(
      tweet.video.variants,
      `${tweet.id_str}:video:0`,
      tweet.video.poster,
    )
    if (asset !== undefined) assets.push(asset)
  }
  return assets
}

function assetFromDetail(
  tweetId: string,
  detail: MediaDetail,
  index: number,
): MediaAsset | undefined {
  if (detail.type === "photo") {
    const url = detail.media_url_https
    if (url === undefined) return undefined
    return imageAsset(
      `${tweetId}:image:${index}`,
      url,
      detail.headers,
      detail.original_info?.width,
      detail.original_info?.height,
    )
  }
  return videoFromVariants(
    detail.video_info?.variants ?? [],
    `${tweetId}:video:${index}`,
    detail.media_url_https,
  )
}

function videoFromVariants(
  variants: readonly Variant[],
  id: string,
  thumbnail: string | undefined,
): VideoAsset | undefined {
  const selected = bestMp4(variants)
  if (selected === undefined) return undefined
  const url = selected.src ?? selected.url
  if (url === undefined) return undefined
  return videoAsset(id, url, selected.headers, selected.bitrate, thumbnail)
}

function bestMp4(variants: readonly Variant[]): Variant | undefined {
  let best: Variant | undefined
  let bestBitrate = -1
  for (const variant of variants) {
    const kind = variant.type ?? variant.content_type
    const url = variant.src ?? variant.url
    if (kind !== "video/mp4" || url === undefined) continue
    const bitrate = variant.bitrate ?? 0
    if (best === undefined || bitrate > bestBitrate) {
      best = variant
      bestBitrate = bitrate
    }
  }
  return best
}

function imageAsset(
  id: string,
  url: string,
  headers: Readonly<Record<string, string>> | undefined,
  width: number | undefined,
  height: number | undefined,
): ImageAsset {
  const asset: {
    type: "image"
    id: string
    delivery: Delivery
    width?: number
    height?: number
  } = {
    type: "image",
    id,
    delivery: deliveryFor(url, headers),
  }
  if (width !== undefined) asset.width = width
  if (height !== undefined) asset.height = height
  return asset
}

function videoAsset(
  id: string,
  url: string,
  headers: Readonly<Record<string, string>> | undefined,
  bitrate: number | undefined,
  thumbnail: string | undefined,
): VideoAsset {
  const asset: {
    type: "video"
    id: string
    delivery: Delivery
    container: "mp4"
    bitrate?: number
    thumbnail?: string
  } = {
    type: "video",
    id,
    container: "mp4",
    delivery: deliveryFor(url, headers),
  }
  if (bitrate !== undefined) asset.bitrate = bitrate
  if (thumbnail !== undefined) asset.thumbnail = thumbnail
  return asset
}

function authorFrom(user: TweetPayload["user"]): Author | undefined {
  if (user === undefined) return undefined
  const author: {
    id?: string
    name?: string
    username?: string
    avatar?: string
    profileUrl?: string
  } = {}
  if (user.id_str !== undefined && user.id_str.length > 0) author.id = user.id_str
  if (user.name !== undefined && user.name.length > 0) author.name = user.name
  if (user.screen_name !== undefined && user.screen_name.length > 0) {
    author.username = user.screen_name
    author.profileUrl = `https://x.com/${encodeURIComponent(user.screen_name)}`
  }
  if (user.profile_image_url_https !== undefined && user.profile_image_url_https.length > 0) {
    author.avatar = user.profile_image_url_https
  }
  if (
    author.id === undefined &&
    author.name === undefined &&
    author.username === undefined &&
    author.avatar === undefined
  ) {
    return undefined
  }
  return author
}

function coverFrom(media: readonly MediaAsset[]): string | undefined {
  for (const asset of media) {
    if (asset.type === "image" && asset.delivery.type === "direct") return asset.delivery.url
    if (asset.type === "video" && asset.thumbnail !== undefined) return asset.thumbnail
  }
  return undefined
}
