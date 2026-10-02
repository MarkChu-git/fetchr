import { Schema } from "effect"

const thumbnailSchema = Schema.Struct({
  url: Schema.String,
  width: Schema.optionalKey(Schema.Number),
  height: Schema.optionalKey(Schema.Number),
})

const thumbnailListSchema = Schema.Struct({
  thumbnails: Schema.Array(thumbnailSchema),
})

const formatSchema = Schema.Struct({
  itag: Schema.Number,
  url: Schema.optionalKey(Schema.String),
  mimeType: Schema.optionalKey(Schema.String),
  bitrate: Schema.optionalKey(Schema.Number),
  width: Schema.optionalKey(Schema.Number),
  height: Schema.optionalKey(Schema.Number),
  fps: Schema.optionalKey(Schema.Number),
  signatureCipher: Schema.optionalKey(Schema.String),
  cipher: Schema.optionalKey(Schema.String),
  drmFamilies: Schema.optionalKey(Schema.Array(Schema.String)),
})

const playerResponseSchema = Schema.Struct({
  playabilityStatus: Schema.Struct({
    status: Schema.String,
    reason: Schema.optionalKey(Schema.String),
  }),
  videoDetails: Schema.optionalKey(
    Schema.Struct({
      videoId: Schema.String,
      title: Schema.optionalKey(Schema.String),
      shortDescription: Schema.optionalKey(Schema.String),
      author: Schema.optionalKey(Schema.String),
      channelId: Schema.optionalKey(Schema.String),
      isPrivate: Schema.optionalKey(Schema.Boolean),
      thumbnail: Schema.optionalKey(thumbnailListSchema),
    }),
  ),
  streamingData: Schema.optionalKey(
    Schema.Struct({
      formats: Schema.optionalKey(Schema.Array(formatSchema)),
      adaptiveFormats: Schema.optionalKey(Schema.Array(formatSchema)),
      hlsManifestUrl: Schema.optionalKey(Schema.String),
      dashManifestUrl: Schema.optionalKey(Schema.String),
    }),
  ),
  microformat: Schema.optionalKey(
    Schema.Struct({
      playerMicroformatRenderer: Schema.optionalKey(
        Schema.Struct({
          publishDate: Schema.optionalKey(Schema.String),
          ownerProfileUrl: Schema.optionalKey(Schema.String),
          thumbnail: Schema.optionalKey(thumbnailListSchema),
        }),
      ),
    }),
  ),
})

export const playerResponseJsonSchema = Schema.fromJsonString(playerResponseSchema)

export type PlayerResponse = typeof playerResponseSchema.Type
export type PlayerFormat = typeof formatSchema.Type
