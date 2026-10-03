import { Schema } from "effect"

const imageEntry = Schema.Struct({
  // The upload object key; sns-img serves the pristine, unwatermarked original.
  fileId: Schema.optionalKey(Schema.String),
  url: Schema.optionalKey(Schema.String),
  urlDefault: Schema.optionalKey(Schema.String),
  urlPre: Schema.optionalKey(Schema.String),
  width: Schema.optionalKey(Schema.Number),
  height: Schema.optionalKey(Schema.Number),
  infoList: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        imageScene: Schema.optionalKey(Schema.String),
        url: Schema.optionalKey(Schema.String),
      }),
    ),
  ),
})

const streamEntry = Schema.Struct({
  masterUrl: Schema.optionalKey(Schema.String),
  size: Schema.optionalKey(Schema.Number),
  backupUrls: Schema.optionalKey(Schema.Array(Schema.String)),
  width: Schema.optionalKey(Schema.Number),
  height: Schema.optionalKey(Schema.Number),
  videoDuration: Schema.optionalKey(Schema.Number),
  duration: Schema.optionalKey(Schema.Number),
  format: Schema.optionalKey(Schema.String),
  audioCodec: Schema.optionalKey(Schema.String),
  videoCodec: Schema.optionalKey(Schema.String),
  qualityType: Schema.optionalKey(Schema.String),
  streamType: Schema.optionalKey(Schema.Number),
  streamDesc: Schema.optionalKey(Schema.String),
  // The page emits 0/1, not true/false.
  defaultStream: Schema.optionalKey(Schema.Number),
})

const noteBody = Schema.Struct({
  noteId: Schema.String,
  title: Schema.optionalKey(Schema.String),
  desc: Schema.optionalKey(Schema.String),
  private: Schema.optionalKey(Schema.Boolean),
  type: Schema.optionalKey(Schema.String),
  user: Schema.optionalKey(
    Schema.Struct({
      userId: Schema.optionalKey(Schema.String),
      nickname: Schema.optionalKey(Schema.String),
      nickName: Schema.optionalKey(Schema.String),
      avatar: Schema.optionalKey(Schema.String),
    }),
  ),
  imageList: Schema.optionalKey(Schema.Array(imageEntry)),
  video: Schema.optionalKey(
    Schema.Struct({
      // pre_post/<key> is the author's original upload — no watermark,
      // full resolution, no signature. The stream entries are the
      // watermarked distribution transcodes.
      consumer: Schema.optionalKey(
        Schema.Struct({
          originVideoKey: Schema.optionalKey(Schema.String),
        }),
      ),
      // Double-encoded JSON carrying the original dimensions.
      mediaV2: Schema.optionalKey(Schema.String),
      media: Schema.optionalKey(
        Schema.Struct({
          stream: Schema.optionalKey(Schema.Record(Schema.String, Schema.Array(streamEntry))),
        }),
      ),
    }),
  ),
})

/** The SSR value is a JS object literal, not JSON: undefined members and new Map() appear. The extractor sanitizes before decoding. */
export const noteDetailMapFromJson = Schema.fromJsonString(
  Schema.Record(
    Schema.String,
    Schema.Struct({
      note: noteBody,
    }),
  ),
)

/** The anonymous mobile share render stores the note at state.noteData.data.noteData. */
export const shareNoteStoreFromJson = Schema.fromJsonString(
  Schema.Struct({
    data: Schema.optionalKey(
      Schema.Struct({
        noteData: Schema.optionalKey(noteBody),
      }),
    ),
  }),
)

export type NoteBody = typeof noteBody.Type
export type ImageEntry = typeof imageEntry.Type
export type StreamEntry = typeof streamEntry.Type
