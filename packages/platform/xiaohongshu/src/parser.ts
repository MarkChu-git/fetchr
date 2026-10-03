import {
  unsignedProxy,
  type Author,
  type CanonicalResource,
  type ExtractFailure,
  type ImageAsset,
  type MediaPost,
  type VideoAsset,
} from "@fetchr/core"
import { Effect } from "effect"

import { failure } from "./errors"
import type { ImageEntry, NoteBody, StreamEntry } from "./schema"

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

/**
 * Pull object subtrees out of the SSR page. The full __INITIAL_STATE__
 * literal mixes JSON with undefined and new Map(), so the parser cannot
 * trust the whole object — individual subtrees are plain JSON modulo
 * undefined members.
 */
const objectsAtMarker = (html: string, marker: string): string[] => {
  const found: string[] = []
  let at = 0
  for (;;) {
    const hit = html.indexOf(marker, at)
    if (hit === -1) return found
    const colon = html.indexOf(":", hit + marker.length)
    if (colon === -1) return found
    let start = colon + 1
    while (start < html.length && /\s/.test(html[start] ?? "")) start += 1
    if (html[start] === "{") {
      const end = endOfJsonObject(html, start)
      if (end !== undefined) {
        const raw = html.slice(start, end)
        found.push(raw.replace(/([:[,]\s*)undefined(?=\s*[,}\]])/g, "$1null"))
      }
    }
    // A non-object value (new Map([]) shows up) or an unbalanced object just skips.
    at = hit + marker.length
  }
}

/** Desktop render keeps the note in note.noteDetailMap keyed by id. */
export const readNoteDetailMap = (html: string): string | undefined =>
  objectsAtMarker(html, "\"noteDetailMap\"")[0]

/**
 * The anonymous mobile share render stores the note at
 * state.noteData.data.noteData. Other noteData members exist, so pick the
 * store whose decoded payload actually carries a noteId.
 */
const hasNoteId = (value: unknown): boolean => {
  if (typeof value !== "object" || value === null || !("data" in value)) return false
  const { data } = value
  if (typeof data !== "object" || data === null || !("noteData" in data)) return false
  const { noteData } = data
  return (
    typeof noteData === "object" &&
    noteData !== null &&
    "noteId" in noteData &&
    typeof noteData.noteId === "string"
  )
}

export const readShareNoteStore = (html: string): string | undefined => {
  for (const candidate of objectsAtMarker(html, "\"noteData\"")) {
    try {
      if (hasNoteId(JSON.parse(candidate))) return candidate
    } catch {
      // Try the next candidate.
    }
  }
  return undefined
}

/** Desktop render keeps the note in note.noteDetailMap keyed by id. */
export const selectNote = (
  map: Readonly<Record<string, { readonly note: NoteBody }>>,
  wanted: string | undefined,
): NoteBody | undefined => {
  if (wanted !== undefined) {
    const hit = map[wanted]?.note
    if (hit !== undefined) return hit
  }
  return Object.values(map)[0]?.note
}

/**
 * The processed delivery URLs (!h5_1080jpg, WB_DFT, …) can carry the
 * 小红书 watermark and are downscaled. sns-img serves the pristine upload
 * by fileId with no signature — prefer it whenever the key is present.
 */
const imageUrl = (image: ImageEntry): string | undefined => {
  if (image.fileId !== undefined && image.fileId.length > 0) {
    return `https://sns-img-bd.xhscdn.com/${image.fileId}`
  }
  if (image.url !== undefined && image.url.length > 0) return image.url
  if (image.urlDefault !== undefined && image.urlDefault.length > 0) return image.urlDefault
  const list = image.infoList ?? []
  const fullSize =
    list.find((item) => item.imageScene === "H5_DTL") ??
    list.find((item) => item.imageScene === "WB_DFT") ??
    list[0]
  if (fullSize?.url !== undefined && fullSize.url.length > 0) return fullSize.url
  if (image.urlPre !== undefined && image.urlPre.length > 0) return image.urlPre
  return undefined
}

const streamUrl = (entry: StreamEntry): string | undefined =>
  entry.masterUrl !== undefined && entry.masterUrl.length > 0 ? entry.masterUrl : undefined

const pickStream = (note: NoteBody): StreamEntry | undefined => {
  const stream = note.video?.media?.stream
  if (stream === undefined) return undefined
  const entries = Object.values(stream).flat().filter((entry) => streamUrl(entry) !== undefined)
  if (entries.length === 0) return undefined
  // A stream with an audio codec plays on its own; fmp4 slices would need muxing.
  const playable = entries.filter(
    (entry) => entry.audioCodec !== undefined && entry.format !== "fmp4",
  )
  const pool = playable.length > 0 ? playable : entries
  const h264 = pool.find((entry) => entry.videoCodec === "h264")
  if (h264 !== undefined) return h264
  return pool.find((entry) => (entry.defaultStream ?? 0) > 0) ?? pool[0]
}

/**
 * The MINI_APP/app-playback transcodes burn in the 小红书 watermark; the
 * WEB_…_h5 web renditions do not (frame-verified on real notes). The
 * smaller download variant therefore prefers a web-tier stream.
 */
const pickVariantStream = (note: NoteBody): StreamEntry | undefined => {
  const stream = note.video?.media?.stream
  if (stream === undefined) return undefined
  const entries = Object.values(stream).flat().filter((entry) => streamUrl(entry) !== undefined)
  const playable = entries.filter(
    (entry) => entry.audioCodec !== undefined && entry.format !== "fmp4",
  )
  const pool = playable.length > 0 ? playable : entries
  return (
    pool.find((entry) => /WEB|_h5/i.test(entry.streamDesc ?? "")) ??
    pool.find((entry) => entry.videoCodec === "h264") ??
    pool[0]
  )
}

/**
 * mediaV2 is a JSON string inside the JSON state. It carries the original
 * upload's dimensions, which the transcoded stream entries do not share.
 */
const originalVideoSize = (
  mediaV2: string | undefined,
): { readonly width?: number; readonly height?: number } => {
  if (mediaV2 === undefined) return {}
  try {
    const parsed: unknown = JSON.parse(mediaV2)
    if (typeof parsed !== "object" || parsed === null || !("video" in parsed)) return {}
    const { video } = parsed
    if (typeof video !== "object" || video === null) return {}
    const width = "width" in video && typeof video.width === "number" ? video.width : undefined
    const height =
      "height" in video && typeof video.height === "number" ? video.height : undefined
    return {
      ...(width === undefined ? {} : { width }),
      ...(height === undefined ? {} : { height }),
    }
  } catch {
    return {}
  }
}

const authorOf = (note: NoteBody): Author | undefined => {
  const name = note.user?.nickname ?? note.user?.nickName
  const avatar = note.user?.avatar
  const userId = note.user?.userId
  if (name === undefined && avatar === undefined) return undefined
  return {
    ...(name === undefined ? {} : { name }),
    // Avatar CDN URLs are unsigned and browser-fetchable.
    ...(avatar === undefined || avatar.length === 0 ? {} : { avatar }),
    ...(userId === undefined || userId.length === 0
      ? {}
      : { profileUrl: `https://www.xiaohongshu.com/user/profile/${userId}` }),
  }
}

export const toMediaPost = (
  note: NoteBody | undefined,
  canonical: CanonicalResource,
): Effect.Effect<MediaPost, ExtractFailure> => {
  if (note === undefined) {
    return Effect.fail(failure("MEDIA_NOT_FOUND", "The post could not be found."))
  }
  if (note.private === true) {
    return Effect.fail(failure("PRIVATE_MEDIA", "This post is private."))
  }
  if (canonical.id !== undefined && canonical.id !== note.noteId) {
    return Effect.fail(failure("SCHEMA_CHANGED", "Embedded state did not match the note id."))
  }

  const author = authorOf(note)
  const images = note.imageList ?? []

  const stream = pickStream(note)
  const videoUrl = stream === undefined ? undefined : streamUrl(stream)
  // pre_post is the author's original upload: watermark-free, full
  // resolution, unsigned. The codec-keyed stream entries are the
  // watermarked transcodes used for in-app playback — kept as the
  // labeled smaller-quality download alongside the original.
  const originVideoKey = note.video?.consumer?.originVideoKey
  const videos: VideoAsset[] = []
  if (originVideoKey !== undefined && originVideoKey.length > 0) {
    videos.push({
      type: "video",
      id: `${note.noteId}-video`,
      // The upload arrives as-is (mp4 or mov); no container claim.
      delivery: unsignedProxy(`https://sns-video-bd.xhscdn.com/${originVideoKey}`),
      ...originalVideoSize(note.video?.mediaV2),
    })
    // A :NNNp suffix marks the asset as a labeled quality variant; the
    // label follows the transcode's short edge (720x1600 -> 720p). The
    // variant comes from the watermark-free web tier, not the app streams.
    const variant = pickVariantStream(note)
    const variantUrl = variant === undefined ? undefined : streamUrl(variant)
    if (
      variant !== undefined &&
      variantUrl !== undefined &&
      variant.width !== undefined &&
      variant.height !== undefined
    ) {
      const edge = Math.min(variant.width, variant.height)
      videos.push({
        type: "video",
        id: `${note.noteId}-video:${edge}p`,
        delivery: unsignedProxy(variantUrl),
        width: variant.width,
        height: variant.height,
        ...(variant.videoCodec === undefined ? {} : { codec: variant.videoCodec }),
        ...(variant.format === undefined ? {} : { container: variant.format }),
        ...(variant.size === undefined ? {} : { bytes: variant.size }),
      })
    }
    // The original upload can be a container or codec the browser cannot
    // play (e.g. .mov in Chrome). The app-tier h264 stream is watermarked
    // but universally playable, so it backs the preview as a :browser
    // fallback — downloads still get the clean versions above.
    if (stream !== undefined && videoUrl !== undefined && videoUrl !== variantUrl) {
      videos.push({
        type: "video",
        id: `${note.noteId}-video:browser`,
        delivery: unsignedProxy(videoUrl),
        ...(stream.width === undefined ? {} : { width: stream.width }),
        ...(stream.height === undefined ? {} : { height: stream.height }),
        ...(stream.videoCodec === undefined ? {} : { codec: stream.videoCodec }),
        ...(stream.format === undefined ? {} : { container: stream.format }),
      })
    }
  } else if (stream !== undefined && videoUrl !== undefined) {
    videos.push({
      type: "video",
      id: `${note.noteId}-video`,
      // Signed CDN URL with a short life; the browser cannot fetch it.
      delivery: unsignedProxy(videoUrl),
      ...(stream.width === undefined ? {} : { width: stream.width }),
      ...(stream.height === undefined ? {} : { height: stream.height }),
      ...(stream.videoCodec === undefined ? {} : { codec: stream.videoCodec }),
      ...(stream.format === undefined ? {} : { container: stream.format }),
      ...(stream.size === undefined ? {} : { bytes: stream.size }),
    })
  }
  const media: Array<ImageAsset | VideoAsset> =
    videos.length > 0
      ? videos
      : images.flatMap((image, index): ImageAsset[] => {
          const url = imageUrl(image)
          if (url === undefined) return []
          return [
            {
              type: "image",
              id: `${note.noteId}-image-${index + 1}`,
              delivery: unsignedProxy(url),
              ...(image.width === undefined ? {} : { width: image.width }),
              ...(image.height === undefined ? {} : { height: image.height }),
            },
          ]
        })

  if (media.length === 0) {
    return Effect.fail(failure("MEDIA_NOT_FOUND", "The post has no media."))
  }

  return Effect.succeed({
    platform: "xiaohongshu",
    id: note.noteId,
    // The canonical form carries no xsec_token; the page shows a clean address.
    canonicalUrl: `https://www.xiaohongshu.com/explore/${note.noteId}`,
    media,
    ...(author === undefined ? {} : { author }),
    ...(note.title === undefined ? {} : { title: note.title }),
    ...(note.desc === undefined ? {} : { description: note.desc }),
  })
}
