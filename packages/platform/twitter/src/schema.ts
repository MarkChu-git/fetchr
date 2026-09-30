import { Schema } from "effect"

const HeaderBag = Schema.Record(Schema.String, Schema.String)

const Variant = Schema.Struct({
  bitrate: Schema.optionalKey(Schema.Number),
  content_type: Schema.optionalKey(Schema.String),
  type: Schema.optionalKey(Schema.String),
  url: Schema.optionalKey(Schema.String),
  src: Schema.optionalKey(Schema.String),
  headers: Schema.optionalKey(HeaderBag),
})

const Dimensions = Schema.Struct({
  width: Schema.optionalKey(Schema.Number),
  height: Schema.optionalKey(Schema.Number),
})

const MediaDetail = Schema.Struct({
  type: Schema.Literals(["photo", "video", "animated_gif"]),
  media_url_https: Schema.optionalKey(Schema.String),
  original_info: Schema.optionalKey(Dimensions),
  headers: Schema.optionalKey(HeaderBag),
  video_info: Schema.optionalKey(
    Schema.Struct({
      variants: Schema.Array(Variant),
    }),
  ),
})

const User = Schema.Struct({
  id_str: Schema.optionalKey(Schema.String),
  name: Schema.optionalKey(Schema.String),
  screen_name: Schema.optionalKey(Schema.String),
  profile_image_url_https: Schema.optionalKey(Schema.String),
})

const Tweet = Schema.Struct({
  __typename: Schema.Literal("Tweet"),
  id_str: Schema.String,
  text: Schema.optionalKey(Schema.String),
  created_at: Schema.optionalKey(Schema.String),
  user: Schema.optionalKey(User),
  mediaDetails: Schema.optionalKey(Schema.Array(MediaDetail)),
  video: Schema.optionalKey(
    Schema.Struct({
      poster: Schema.optionalKey(Schema.String),
      variants: Schema.Array(Variant),
    }),
  ),
})

// A protected account is Protected. A post that requires a login is NsfwLoggedOut. They are different failures.
const ProtectedTweet = Schema.Struct({
  __typename: Schema.Literal("TweetUnavailable"),
  reason: Schema.String,
})

export const SyndicationResult = Schema.Union([ProtectedTweet, Tweet])

export type SyndicationBody = typeof SyndicationResult.Type
export type TweetPayload = typeof Tweet.Type
