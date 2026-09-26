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
  video_url: HttpsUrl,
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
        node: CarouselImage,
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
