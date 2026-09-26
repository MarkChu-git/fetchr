import { Effect, Schema } from "effect"
import type { ExtractFailure } from "@fetchr/core"

const schemaChanged: ExtractFailure = {
  code: "SCHEMA_CHANGED",
  message: "Bilibili response did not match the expected schema.",
}

export const Owner = Schema.Struct({
  mid: Schema.optionalKey(Schema.Number),
  name: Schema.optionalKey(Schema.String),
  face: Schema.optionalKey(Schema.String),
})

export const ViewData = Schema.Struct({
  bvid: Schema.optionalKey(Schema.String),
  cid: Schema.Number,
  title: Schema.optionalKey(Schema.String),
  desc: Schema.optionalKey(Schema.String),
  pic: Schema.optionalKey(Schema.String),
  pubdate: Schema.optionalKey(Schema.Number),
  owner: Schema.optionalKey(Owner),
})

export type ViewData = typeof ViewData.Type

export const ViewEnvelope = Schema.Struct({
  code: Schema.Number,
  message: Schema.optionalKey(Schema.String),
  data: Schema.NullOr(ViewData),
})

export const DashStream = Schema.Struct({
  id: Schema.optionalKey(Schema.Number),
  baseUrl: Schema.optionalKey(Schema.String),
  base_url: Schema.optionalKey(Schema.String),
  bandwidth: Schema.optionalKey(Schema.Number),
  mimeType: Schema.optionalKey(Schema.String),
  mime_type: Schema.optionalKey(Schema.String),
  codecs: Schema.optionalKey(Schema.String),
  width: Schema.optionalKey(Schema.Number),
  height: Schema.optionalKey(Schema.Number),
  frameRate: Schema.optionalKey(Schema.String),
  frame_rate: Schema.optionalKey(Schema.String),
})

export type DashStream = typeof DashStream.Type

export const Dash = Schema.Struct({
  duration: Schema.optionalKey(Schema.Number),
  minBufferTime: Schema.optionalKey(Schema.Number),
  video: Schema.optionalKey(Schema.NullOr(Schema.Array(DashStream))),
  audio: Schema.optionalKey(Schema.NullOr(Schema.Array(DashStream))),
})

export const Durl = Schema.Struct({
  order: Schema.optionalKey(Schema.Number),
  length: Schema.optionalKey(Schema.Number),
  size: Schema.optionalKey(Schema.Number),
  url: Schema.String,
})

export const PlayData = Schema.Struct({
  quality: Schema.optionalKey(Schema.Number),
  format: Schema.optionalKey(Schema.String),
  timelength: Schema.optionalKey(Schema.Number),
  durl: Schema.optionalKey(Schema.Array(Durl)),
  dash: Schema.optionalKey(Dash),
})

export type PlayData = typeof PlayData.Type

export const PlayEnvelope = Schema.Struct({
  code: Schema.Number,
  message: Schema.optionalKey(Schema.String),
  data: Schema.NullOr(PlayData),
})

export function decodeUnknown<S extends Schema.Constraint>(
  schema: S,
  input: unknown,
) {
  return Effect.mapError(Schema.decodeUnknownEffect(schema)(input), () => schemaChanged)
}
