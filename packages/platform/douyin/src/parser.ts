import {
  hostAllowed,
  unsignedProxy,
  type Author,
  type CanonicalResource,
  type Delivery,
  type ExtractFailure,
  type ImageAsset,
  type MediaAsset,
  type MediaPost,
  type VideoAsset,
} from "@fetchr/core"
import { Effect, Schema } from "effect"
import { failure } from "./failure"
import { browserPlayUrl, highDefinitionPlayUrl } from "./session"

const UrlList = Schema.Struct({
  url_list: Schema.Array(Schema.String),
})

const AuthorPayload = Schema.Struct({
  uid: Schema.optionalKey(Schema.String),
  nickname: Schema.optionalKey(Schema.String),
  unique_id: Schema.optionalKey(Schema.String),
  avatar_thumb: Schema.optionalKey(UrlList),
})

const PlayAddr = Schema.Struct({
  url_list: Schema.Array(Schema.String),
  uri: Schema.optionalKey(Schema.String),
})

const BitRateTier = Schema.Struct({
  gear_name: Schema.optionalKey(Schema.String),
  bit_rate: Schema.optionalKey(Schema.Number),
  play_addr: Schema.optionalKey(PlayAddr),
})

const VideoPayload = Schema.Struct({
  width: Schema.optionalKey(Schema.Number),
  height: Schema.optionalKey(Schema.Number),
  cover: Schema.optionalKey(UrlList),
  play_addr: Schema.optionalKey(PlayAddr),
  // Douyin's own pre-encoded renditions. gear_name is like 720_1_1 or 540_2_1.
  bit_rate: Schema.optionalKey(Schema.NullOr(Schema.Array(BitRateTier))),
})

const ImagePayload = Schema.Struct({
  url_list: Schema.Array(Schema.String),
  width: Schema.optionalKey(Schema.Number),
  height: Schema.optionalKey(Schema.Number),
})

const AwemeDetail = Schema.Struct({
  aweme_id: Schema.String,
  desc: Schema.optionalKey(Schema.String),
  // Milliseconds. With a tier's bit_rate it estimates the tier's file size.
  duration: Schema.optionalKey(Schema.Number),
  author: Schema.optionalKey(AuthorPayload),
  // A public note often omits this field, or sets it to null. Treat only 1 as private. null must not fail the whole parse.
  private_status: Schema.optionalKey(Schema.NullOr(Schema.Literals([0, 1]))),
  video: Schema.optionalKey(VideoPayload),
  images: Schema.optionalKey(Schema.NullOr(Schema.Array(ImagePayload))),
})

const DetailPayload = Schema.Struct({
  status_code: Schema.Number,
  aweme_detail: AwemeDetail,
})

type Aweme = typeof AwemeDetail.Type

function firstHttpUrl(urls: readonly string[] | undefined): string | undefined {
  if (urls === undefined) return undefined
  for (const url of urls) {
    if (url.startsWith("https://") || url.startsWith("http://")) return url
  }
  return undefined
}

function isWebp(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".webp")
  } catch {
    return false
  }
}

function isHeic(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".heic")
  } catch {
    return false
  }
}

/**
 * Avatar lists lead with a HEIC variant, which no browser draws in <img>.
 * Take the last non-HEIC entry, mirroring the webp rule for post images.
 */
function avatarUrl(urls: readonly string[] | undefined): string | undefined {
  if (urls === undefined) return undefined
  const http = urls.filter(
    (url) => url.startsWith("https://") || url.startsWith("http://"),
  )
  for (let index = http.length - 1; index >= 0; index -= 1) {
    const url = http[index]
    if (url !== undefined && !isHeic(url)) return url
  }
  return undefined
}

/**
 * An earlier url_list entry is often a webp preview; live photo stills come as HEIC.
 * Neither renders in a browser <img>. Prefer the last browser-safe entry, but keep
 * the last http entry when nothing else exists so the asset stays downloadable.
 * download_url_list carries a watermark. Do not read it here.
 */
function imageUrl(urls: readonly string[] | undefined): string | undefined {
  if (urls === undefined) return undefined
  const http = urls.filter(
    (url) => url.startsWith("https://") || url.startsWith("http://"),
  )
  for (let index = http.length - 1; index >= 0; index -= 1) {
    const url = http[index]
    if (url !== undefined && !isWebp(url) && !isHeic(url)) return url
  }
  return http[http.length - 1]
}

function hostNeedsProxy(url: string): boolean {
  let hostname: string
  try {
    hostname = new URL(url).hostname.toLowerCase()
  } catch {
    return false
  }
  return hostAllowed(hostname, [
    "douyinpic.com",
    "douyincdn.com",
    "byteimg.com",
    "ibyteimg.com",
  ])
}

/** The image host does not let the browser read bytes across origins, so use the proxy. Fixture hosts still return directly. */
function imageDelivery(url: string): Delivery {
  if (!hostNeedsProxy(url)) return { type: "direct", url }
  return unsignedProxy(url, { Referer: "https://www.douyin.com/" })
}

/**
 * playwm is the watermarked play URL. The share page puts the URL without a watermark in the same list. Prefer that one.
 * The browser cannot set Douyin's Referer, so the Worker fetches the video.
 */
function playUrl(urls: readonly string[] | undefined): string | undefined {
  if (urls === undefined) return undefined
  const http = urls.filter(
    (url) => url.startsWith("https://") || url.startsWith("http://"),
  )
  const clean = http.find((url) => !url.includes("playwm"))
  if (clean !== undefined) return clean
  const marked = http.find((url) => url.includes("playwm"))
  if (marked === undefined) return undefined
  return marked.replaceAll("playwm", "play")
}

function authorFrom(author: typeof AuthorPayload.Type | undefined): Author | undefined {
  if (author === undefined) return undefined
  const avatar = avatarUrl(author.avatar_thumb?.url_list)
  const result: Author = {
    ...(author.uid === undefined ? {} : { id: author.uid }),
    ...(author.nickname === undefined ? {} : { name: author.nickname }),
    ...(author.unique_id === undefined ? {} : { username: author.unique_id }),
    ...(avatar === undefined ? {} : { avatar }),
  }
  return Object.keys(result).length === 0 ? undefined : result
}

function imageAsset(
  awemeId: string,
  index: number,
  url: string,
  width: number | undefined,
  height: number | undefined,
): ImageAsset {
  return {
    type: "image",
    id: `${awemeId}:${index}`,
    delivery: imageDelivery(url),
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
  }
}

function videoAsset(detail: Aweme, url: string, id = detail.aweme_id): VideoAsset {
  const video = detail.video
  const cover = firstHttpUrl(video?.cover?.url_list)
  const width = video?.width
  const height = video?.height
  return {
    type: "video",
    id,
    delivery: unsignedProxy(url, { Referer: "https://www.douyin.com/" }),
    ...(cover === undefined ? {} : { thumbnail: cover }),
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
  }
}

/** One rendition per resolution class: the highest bitrate the class offers. */
function qualityTiers(detail: Aweme): readonly VideoAsset[] {
  const tiers = detail.video?.bit_rate
  if (tiers === undefined || tiers === null) return []
  const best = new Map<string, { rate: number; url: string }>()
  for (const tier of tiers) {
    const gear = tier.gear_name ?? ""
    const cls = gear.startsWith("720") ? "720p" : gear.startsWith("540") ? "540p" : undefined
    if (cls === undefined) continue
    const url = firstHttpUrl(tier.play_addr?.url_list)
    if (url === undefined) continue
    const rate = tier.bit_rate ?? 0
    const current = best.get(cls)
    if (current === undefined || rate > current.rate) best.set(cls, { rate, url })
  }
  const assets: VideoAsset[] = []
  for (const cls of ["720p", "540p"] as const) {
    const tier = best.get(cls)
    // Ids end in :720p / :540p; the page lists them as labeled quality downloads, not as separate videos.
    if (tier === undefined) continue
    const asset = videoAsset(detail, tier.url, `${detail.aweme_id}:${cls}`)
    const seconds = (detail.duration ?? 0) / 1000
    const bytes = seconds > 0 && tier.rate > 0
      ? Math.round((tier.rate * seconds) / 8)
      : undefined
    assets.push({
      ...asset,
      bitrate: tier.rate,
      ...(bytes === undefined ? {} : { bytes }),
    })
  }
  return assets
}

function mediaFrom(detail: Aweme): readonly MediaAsset[] {
  const images = detail.images
  if (images !== undefined && images !== null && images.length > 0) {
    const assets: ImageAsset[] = []
    for (let index = 0; index < images.length; index += 1) {
      const image = images[index]
      if (image === undefined) continue
      const url = imageUrl(image.url_list)
      if (url === undefined) continue
      assets.push(
        imageAsset(detail.aweme_id, index, url, image.width, image.height),
      )
    }
    return assets
  }

  const original = highDefinitionPlayUrl(detail.video?.play_addr?.uri)
  const url = original ?? playUrl(detail.video?.play_addr?.url_list)
  if (url === undefined) return []
  const assets = [videoAsset(detail, url)]
  const fallback = browserPlayUrl(detail.video?.play_addr?.uri)
  // The second item only fills the picture when the browser cannot decode the original. Its id ends in :browser, and the page gives it no download button of its own.
  if (original !== undefined && fallback !== undefined) {
    assets.push(videoAsset(detail, fallback, `${detail.aweme_id}:browser`))
  }
  assets.push(...qualityTiers(detail))
  return assets
}

function coverFrom(detail: Aweme): string | undefined {
  // A proxied image-host URL cannot be placed on the page directly. The cover would break, and it would repeat the image below.
  const fromVideo = firstHttpUrl(detail.video?.cover?.url_list)
  if (fromVideo !== undefined && !hostNeedsProxy(fromVideo)) return fromVideo
  const fromImage = imageUrl(detail.images?.[0]?.url_list)
  if (fromImage !== undefined && !hostNeedsProxy(fromImage)) return fromImage
  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/**
 * Web detail is `{ aweme_detail }`. The mobile feed mixes the target work into `aweme_list`.
 * Never take item 0. That would download a different work.
 */
export function selectDetail(input: unknown, id: string): unknown {
  if (!isRecord(input)) return undefined
  if ("aweme_detail" in input) return input
  const list = Array.isArray(input.aweme_list)
    ? input.aweme_list
    : undefined
  if (list === undefined) return undefined
  const item = list.find(
    (entry) => isRecord(entry) && String(entry.aweme_id) === id,
  )
  if (item === undefined) return undefined
  const statusCode = typeof input.status_code === "number" ? input.status_code : 0
  return { status_code: statusCode, aweme_detail: item }
}

export function parseDetail(
  input: unknown,
  canonical: CanonicalResource,
): Effect.Effect<MediaPost, ExtractFailure> {
  return Effect.gen(function* () {
    const payload = yield* Effect.mapError(
      Schema.decodeUnknownEffect(DetailPayload)(input),
      () =>
        failure(
          "SCHEMA_CHANGED",
          "Douyin detail payload did not match the schema",
        ),
    )
    if (payload.status_code !== 0) {
      return yield* Effect.fail(
        failure("SOURCE_UNAVAILABLE", "Douyin detail status was not ok"),
      )
    }
    const detail = payload.aweme_detail
    if (detail.private_status === 1) {
      return yield* Effect.fail(failure("PRIVATE_MEDIA", "Douyin post is private"))
    }
    if (canonical.id !== undefined && canonical.id !== detail.aweme_id) {
      return yield* Effect.fail(
        failure("SCHEMA_CHANGED", "Douyin video id did not match the canonical resource"),
      )
    }
    const media = mediaFrom(detail)
    if (media.length === 0) {
      return yield* Effect.fail(failure("MEDIA_NOT_FOUND", "Douyin post had no media"))
    }
    const author = authorFrom(detail.author)
    const description = detail.desc
    const cover = coverFrom(detail)
    return {
      platform: "douyin",
      id: detail.aweme_id,
      canonicalUrl: canonical.url.toString(),
      media,
      ...(author === undefined ? {} : { author }),
      ...(description === undefined ? {} : { description }),
      ...(cover === undefined ? {} : { thumbnail: cover }),
    }
  })
}
