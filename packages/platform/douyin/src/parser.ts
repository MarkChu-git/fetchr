import type {
  Author,
  CanonicalResource,
  ExtractFailure,
  ImageAsset,
  MediaAsset,
  MediaPost,
  VideoAsset,
} from "@fetchr/core"
import { Effect, Schema } from "effect"
import { failure } from "./failure"

const UrlList = Schema.Struct({
  url_list: Schema.Array(Schema.String),
})

const AuthorPayload = Schema.Struct({
  uid: Schema.optionalKey(Schema.String),
  nickname: Schema.optionalKey(Schema.String),
  unique_id: Schema.optionalKey(Schema.String),
  avatar_thumb: Schema.optionalKey(UrlList),
})

const VideoPayload = Schema.Struct({
  width: Schema.optionalKey(Schema.Number),
  height: Schema.optionalKey(Schema.Number),
  cover: Schema.optionalKey(UrlList),
  play_addr: Schema.optionalKey(UrlList),
})

const ImagePayload = Schema.Struct({
  url_list: Schema.Array(Schema.String),
  width: Schema.optionalKey(Schema.Number),
  height: Schema.optionalKey(Schema.Number),
})

const AwemeDetail = Schema.Struct({
  aweme_id: Schema.String,
  desc: Schema.optionalKey(Schema.String),
  author: Schema.optionalKey(AuthorPayload),
  private_status: Schema.optionalKey(Schema.Literals([0, 1])),
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

function authorFrom(author: typeof AuthorPayload.Type | undefined): Author | undefined {
  if (author === undefined) return undefined
  const avatar = firstHttpUrl(author.avatar_thumb?.url_list)
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
    delivery: { type: "direct", url },
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
  }
}

function videoAsset(detail: Aweme, url: string): VideoAsset {
  const video = detail.video
  const cover = firstHttpUrl(video?.cover?.url_list)
  const width = video?.width
  const height = video?.height
  return {
    type: "video",
    id: detail.aweme_id,
    delivery: { type: "direct", url },
    ...(cover === undefined ? {} : { thumbnail: cover }),
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
  }
}

function mediaFrom(detail: Aweme): readonly MediaAsset[] {
  const images = detail.images
  if (images !== undefined && images !== null && images.length > 0) {
    const assets: ImageAsset[] = []
    for (let index = 0; index < images.length; index += 1) {
      const image = images[index]
      if (image === undefined) continue
      const url = firstHttpUrl(image.url_list)
      if (url === undefined) continue
      assets.push(
        imageAsset(detail.aweme_id, index, url, image.width, image.height),
      )
    }
    return assets
  }

  const url = firstHttpUrl(detail.video?.play_addr?.url_list)
  if (url === undefined) return []
  return [videoAsset(detail, url)]
}

function coverFrom(detail: Aweme): string | undefined {
  const fromVideo = firstHttpUrl(detail.video?.cover?.url_list)
  if (fromVideo !== undefined) return fromVideo
  const first = detail.images?.[0]
  return firstHttpUrl(first?.url_list)
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
