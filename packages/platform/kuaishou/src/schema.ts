import { Schema } from "effect"

// Short-video pages embed Apollo VisionVideoDetailPhoto.
// Share pages embed window.INIT_STATE, and carousels live on photo.ext_params.atlas.

const maybe = <S extends Schema.Constraint>(schema: S) =>
  Schema.optionalKey(Schema.NullishOr(schema))

const JsonId = Schema.Union([Schema.String, Schema.Number])

const CdnUrl = Schema.Struct({
  url: Schema.String,
})

const Representation = Schema.Struct({
  url: Schema.String,
  width: maybe(Schema.Number),
  height: maybe(Schema.Number),
  avgBitrate: maybe(Schema.Number),
  maxBitrate: maybe(Schema.Number),
  frameRate: maybe(Schema.Number),
  codecs: maybe(Schema.String),
})

const AdaptationSet = Schema.Struct({
  representation: maybe(Schema.Array(Representation)),
})

const ManifestBody = Schema.Struct({
  adaptationSet: maybe(Schema.Array(AdaptationSet)),
})

const WrappedManifest = Schema.Struct({
  type: Schema.Literal("json"),
  json: ManifestBody,
})

export const VideoResourceJson = Schema.Struct({
  h264: maybe(ManifestBody),
  hevc: maybe(ManifestBody),
  adaptationSet: maybe(Schema.Array(AdaptationSet)),
})

const WrappedVideoResource = Schema.Struct({
  type: Schema.Literal("json"),
  json: VideoResourceJson,
})

const AtlasSize = Schema.Struct({
  w: maybe(Schema.Number),
  h: maybe(Schema.Number),
  width: maybe(Schema.Number),
  height: maybe(Schema.Number),
})

const Atlas = Schema.Struct({
  cdn: Schema.Array(Schema.String),
  list: Schema.Array(Schema.String),
  size: maybe(Schema.Array(AtlasSize)),
})

const ExtParams = Schema.Struct({
  atlas: maybe(Atlas),
})

export const VisionAuthorEntity = Schema.Struct({
  __typename: Schema.Literal("VisionVideoDetailAuthor"),
  id: Schema.String,
  name: maybe(Schema.String),
  headerUrl: maybe(Schema.String),
})

const EntityRef = Schema.Struct({
  __ref: Schema.String,
})

const PhotoRef = Schema.Struct({
  id: Schema.String,
})

export const Detail = Schema.Struct({
  __typename: Schema.Literal("VisionVideoDetail"),
  author: maybe(Schema.Union([EntityRef, VisionAuthorEntity])),
  photo: maybe(Schema.Union([EntityRef, PhotoRef])),
})

export const VisionPhoto = Schema.Struct({
  __typename: Schema.Literal("VisionVideoDetailPhoto"),
  id: Schema.String,
  caption: maybe(Schema.String),
  coverUrl: maybe(Schema.String),
  photoUrl: maybe(Schema.String),
  photoH265Url: maybe(Schema.String),
  timestamp: maybe(Schema.Number),
  manifest: maybe(Schema.Unknown),
  videoResource: maybe(Schema.Unknown),
  ext_params: maybe(ExtParams),
  extParams: maybe(ExtParams),
})

export const ApolloState = Schema.Struct({
  defaultClient: Schema.Record(Schema.String, Schema.Unknown),
})

export const SharePhoto = Schema.Struct({
  photoId: Schema.String,
  caption: maybe(Schema.String),
  userEid: maybe(Schema.String),
  userId: maybe(JsonId),
  userName: maybe(Schema.String),
  headUrl: maybe(Schema.String),
  coverUrls: maybe(Schema.Array(CdnUrl)),
  mainMvUrls: maybe(Schema.Array(CdnUrl)),
  ext_params: maybe(ExtParams),
  extParams: maybe(ExtParams),
  timestamp: maybe(Schema.Number),
})

export const ShareEntry = Schema.Struct({
  result: maybe(Schema.Number),
  photo: SharePhoto,
})

export const InitState = Schema.Record(Schema.String, Schema.Unknown)

export { Atlas, ManifestBody, Representation, WrappedManifest, WrappedVideoResource }
