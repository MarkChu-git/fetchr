import { Schema } from "effect"

const TikTokAuthor = Schema.Struct({
  id: Schema.String,
  uniqueId: Schema.String,
  nickname: Schema.String,
  avatarThumb: Schema.optionalKey(Schema.String),
})

const TikTokVideo = Schema.Struct({
  cover: Schema.optionalKey(Schema.String),
  playAddr: Schema.optionalKey(Schema.String),
  width: Schema.optionalKey(Schema.Number),
  height: Schema.optionalKey(Schema.Number),
})

const TikTokItem = Schema.Struct({
  id: Schema.String,
  desc: Schema.String,
  author: TikTokAuthor,
  video: Schema.optionalKey(TikTokVideo),
})

export const TikTokPage = Schema.Struct({
  __DEFAULT_SCOPE__: Schema.Struct({
    "webapp.video-detail": Schema.optionalKey(
      Schema.Struct({
        statusCode: Schema.Number,
        itemInfo: Schema.optionalKey(
          Schema.Struct({
            itemStruct: Schema.optionalKey(TikTokItem),
          }),
        ),
      }),
    ),
  }),
})

export type TikTokPage = typeof TikTokPage.Type
