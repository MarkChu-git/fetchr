import { Schema } from "effect"

const HttpsUrl = Schema.String.check(
  Schema.isPattern(/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?\/\S*$/),
)

const PositiveInt = Schema.Finite.check(
  Schema.isInt(),
  Schema.isGreaterThan(0),
)

const Shortcode = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]+$/))

const Username = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9._]{1,30}$/),
)

// ── Crawler page payload (xig_polaris_media, anonymous) ─────────────

const CrawlerUser = Schema.Struct({
  username: Schema.optionalKey(Username),
  full_name: Schema.optionalKey(Schema.String),
  profile_pic_url: Schema.optionalKey(HttpsUrl),
})

const CaptionText = Schema.Struct({
  text: Schema.String,
})

const ImageCandidate = Schema.Struct({
  url: HttpsUrl,
  width: Schema.optionalKey(PositiveInt),
  height: Schema.optionalKey(PositiveInt),
})

const ImageVersions2 = Schema.Struct({
  candidates: Schema.NonEmptyArray(ImageCandidate),
})

const VideoVersion = Schema.Struct({
  url: HttpsUrl,
  type: Schema.Finite,
})

const crawlerBase = {
  code: Shortcode,
  user: Schema.optionalKey(CrawlerUser),
  caption: Schema.optionalKey(Schema.NullOr(CaptionText)),
  taken_at: Schema.optionalKey(Schema.Finite),
  original_width: Schema.optionalKey(PositiveInt),
  original_height: Schema.optionalKey(PositiveInt),
  image_versions2: Schema.optionalKey(ImageVersions2),
}

const CrawlerVideo = Schema.Struct({
  ...crawlerBase,
  __typename: Schema.Literal("XIGPolarisVideoMedia"),
  video_versions: Schema.NonEmptyArray(VideoVersion),
})

const CrawlerImage = Schema.Struct({
  ...crawlerBase,
  __typename: Schema.Literal("XIGPolarisImageMedia"),
  image_versions2: ImageVersions2,
})

const CrawlerChild = Schema.Union([CrawlerVideo, CrawlerImage])

const CrawlerCarousel = Schema.Struct({
  ...crawlerBase,
  __typename: Schema.Literal("XIGPolarisCarouselMedia"),
  carousel_media: Schema.NonEmptyArray(CrawlerChild),
})

export const CrawlerMedia = Schema.Union([
  CrawlerVideo,
  CrawlerImage,
  CrawlerCarousel,
])

export type CrawlerMedia = typeof CrawlerMedia.Type

// ── Embed page payload (gql_data inside contextJSON) ────────────────

const Dimensions = Schema.Struct({
  width: PositiveInt,
  height: PositiveInt,
})

const Owner = Schema.Struct({
  username: Schema.optionalKey(Username),
  full_name: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty())),
})

const Caption = Schema.Struct({
  edges: Schema.Array(
    Schema.Struct({
      node: Schema.Struct({
        text: Schema.String,
      }),
    }),
  ),
})

const GraphImage = Schema.Struct({
  __typename: Schema.Literal("GraphImage"),
  shortcode: Shortcode,
  display_url: HttpsUrl,
  is_video: Schema.Literal(false),
  dimensions: Schema.optionalKey(Dimensions),
  owner: Schema.optionalKey(Owner),
  edge_media_to_caption: Schema.optionalKey(Caption),
})

const GraphVideo = Schema.Struct({
  __typename: Schema.Literal("GraphVideo"),
  shortcode: Shortcode,
  display_url: HttpsUrl,
  video_url: Schema.optionalKey(HttpsUrl),
  is_video: Schema.Literal(true),
  dimensions: Schema.optionalKey(Dimensions),
  owner: Schema.optionalKey(Owner),
  edge_media_to_caption: Schema.optionalKey(Caption),
})

const CarouselImage = Schema.Struct({
  __typename: Schema.Literal("GraphImage"),
  is_video: Schema.Literal(false),
  display_url: HttpsUrl,
  dimensions: Schema.optionalKey(Dimensions),
})

const CarouselVideo = Schema.Struct({
  __typename: Schema.Literal("GraphVideo"),
  is_video: Schema.Literal(true),
  display_url: HttpsUrl,
  video_url: Schema.optionalKey(HttpsUrl),
  dimensions: Schema.optionalKey(Dimensions),
})

const GraphSidecar = Schema.Struct({
  __typename: Schema.Literal("GraphSidecar"),
  shortcode: Shortcode,
  display_url: HttpsUrl,
  is_video: Schema.Literal(false),
  dimensions: Schema.optionalKey(Dimensions),
  owner: Schema.optionalKey(Owner),
  edge_media_to_caption: Schema.optionalKey(Caption),
  edge_sidecar_to_children: Schema.Struct({
    edges: Schema.NonEmptyArray(
      Schema.Struct({
        node: Schema.Union([CarouselImage, CarouselVideo]),
      }),
    ),
  }),
})

const PostPayload = Schema.Struct({
  shortcode_media: Schema.Union([GraphImage, GraphVideo, GraphSidecar]),
})

const FailurePayload = Schema.Struct({
  status: Schema.Literal("fail"),
  message: Schema.Literals(["private_media", "login_required"]),
})

export const InstagramPayload = Schema.Union([PostPayload, FailurePayload])

export type ShortcodeMedia =
  | typeof GraphImage.Type
  | typeof GraphVideo.Type
  | typeof GraphSidecar.Type
