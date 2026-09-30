import { Schema } from "effect"

const TikTokAuthor = Schema.Struct({
  id: Schema.String,
  uniqueId: Schema.String,
  nickname: Schema.String,
  avatarThumb: Schema.optionalKey(Schema.String),
})

const TikTokVideo = Schema.Struct({
  cover: Schema.optionalKey(Schema.String),
  playAddr: Schema.String,
  width: Schema.optionalKey(Schema.Number),
  height: Schema.optionalKey(Schema.Number),
})

const TikTokItem = Schema.Struct({
  id: Schema.String,
  desc: Schema.String,
  author: TikTokAuthor,
  video: TikTokVideo,
})

export const TikTokPage = Schema.Struct({
  __DEFAULT_SCOPE__: Schema.Struct({
    "webapp.video-detail": Schema.Struct({
      statusCode: Schema.Number,
      itemInfo: Schema.optionalKey(
        Schema.Struct({
          itemStruct: TikTokItem,
        }),
      ),
    }),
  }),
})

export type TikTokPage = typeof TikTokPage.Type

export const TikTokPageJson = Schema.fromJsonString(TikTokPage)
