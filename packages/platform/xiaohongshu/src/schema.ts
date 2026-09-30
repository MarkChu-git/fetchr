import { Schema } from "effect"

const cdnFile = Schema.Struct({
  url: Schema.String,
  width: Schema.optionalKey(Schema.Number),
  height: Schema.optionalKey(Schema.Number),
  requiresReferer: Schema.optionalKey(Schema.Boolean),
})

const noteBody = Schema.Struct({
  noteId: Schema.String,
  title: Schema.optionalKey(Schema.String),
  desc: Schema.optionalKey(Schema.String),
  private: Schema.optionalKey(Schema.Boolean),
  user: Schema.optionalKey(
    Schema.Struct({
      nickname: Schema.optionalKey(Schema.String),
    }),
  ),
  imageList: Schema.optionalKey(Schema.Array(cdnFile)),
  video: Schema.optionalKey(cdnFile),
})

const initialState = Schema.Struct({
  currentNoteId: Schema.optionalKey(Schema.String),
  noteDetailMap: Schema.Record(
    Schema.String,
    Schema.Struct({
      note: noteBody,
    }),
  ),
})

export const embeddedStateFromJson = Schema.fromJsonString(initialState)

export type EmbeddedState = typeof initialState.Type
export type NoteBody = typeof noteBody.Type
export type CdnFile = typeof cdnFile.Type
