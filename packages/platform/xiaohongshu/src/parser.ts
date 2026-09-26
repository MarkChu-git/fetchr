import type {
  Author,
  CanonicalResource,
  Delivery,
  ExtractFailure,
  ImageAsset,
  MediaPost,
  VideoAsset,
} from "@fetchr/core"
import { Effect } from "effect"

import { failure } from "./errors"
import type { CdnFile, EmbeddedState, NoteBody } from "./schema"

const deliveryFor = (file: CdnFile): Delivery => {
  if (file.requiresReferer === true) {
    // Real proxy tokens are minted by the delivery package. Do not sign here.
    return { type: "proxy", token: "pending" }
  }
  return { type: "direct", url: file.url }
}

const endOfJsonObject = (input: string, start: number): number | undefined => {
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < input.length; index++) {
    const char = input[index]
    if (char === undefined) return undefined
    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === "\\") {
        escaped = true
        continue
      }
      if (char === "\"") inString = false
      continue
    }
    if (char === "\"") {
      inString = true
      continue
    }
    if (char === "{") depth += 1
    if (char === "}") {
      depth -= 1
      if (depth === 0) return index + 1
    }
  }
  return undefined
}

export const readEmbeddedJson = (html: string): string | undefined => {
  const markerAt = html.indexOf("window.__INITIAL_STATE__")
  if (markerAt === -1) return undefined
  const start = html.indexOf("{", markerAt)
  if (start === -1) return undefined
  const end = endOfJsonObject(html, start)
  if (end === undefined) return undefined
  return html.slice(start, end)
}

const selectNote = (state: EmbeddedState): NoteBody | undefined => {
  const noteId = state.currentNoteId
  if (noteId !== undefined) return state.noteDetailMap[noteId]?.note
  return Object.values(state.noteDetailMap)[0]?.note
}

const coverUrl = (note: NoteBody): string | undefined => {
  const images = note.imageList
  if (images === undefined) return undefined
  for (const image of images) {
    if (image.requiresReferer !== true) return image.url
  }
  return undefined
}

const authorOf = (note: NoteBody): Author | undefined => {
  const name = note.user?.nickname
  if (name === undefined) return undefined
  return { name }
}

const videoAsset = (note: NoteBody, video: CdnFile, thumbnail: string | undefined): VideoAsset => ({
  type: "video",
  id: `${note.noteId}-video`,
  delivery: deliveryFor(video),
  ...(video.width === undefined ? {} : { width: video.width }),
  ...(video.height === undefined ? {} : { height: video.height }),
  ...(thumbnail === undefined ? {} : { thumbnail }),
})

const imageAsset = (note: NoteBody, image: CdnFile, index: number): ImageAsset => ({
  type: "image",
  id: `${note.noteId}-image-${index + 1}`,
  delivery: deliveryFor(image),
  ...(image.width === undefined ? {} : { width: image.width }),
  ...(image.height === undefined ? {} : { height: image.height }),
})

export const toMediaPost = (
  state: EmbeddedState,
  canonical: CanonicalResource,
): Effect.Effect<MediaPost, ExtractFailure> => {
  const note = selectNote(state)
  if (note === undefined) {
    return Effect.fail(failure("MEDIA_NOT_FOUND", "The post could not be found."))
  }
  if (note.private === true) {
    return Effect.fail(failure("PRIVATE_MEDIA", "This post is private."))
  }
  if (canonical.id !== undefined && canonical.id !== note.noteId) {
    return Effect.fail(failure("SCHEMA_CHANGED", "Embedded state did not match the explore id."))
  }

  const thumbnail = coverUrl(note)
  const author = authorOf(note)
  const video = note.video
  const images = note.imageList ?? []

  const media = video !== undefined
    ? [videoAsset(note, video, thumbnail)]
    : images.map((image, index) => imageAsset(note, image, index))

  if (media.length === 0) {
    return Effect.fail(failure("MEDIA_NOT_FOUND", "The post has no media."))
  }

  return Effect.succeed({
    platform: "xiaohongshu",
    id: note.noteId,
    canonicalUrl: `https://www.xiaohongshu.com/explore/${note.noteId}`,
    media,
    ...(author === undefined ? {} : { author }),
    ...(note.title === undefined ? {} : { title: note.title }),
    ...(note.desc === undefined ? {} : { description: note.desc }),
    ...(thumbnail === undefined ? {} : { thumbnail }),
  })
}
