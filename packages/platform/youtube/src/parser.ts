import { Effect } from "effect"
import {
  unsignedProxy,
  type Author,
  type ExtractFailure,
  type MediaPost,
  type VideoAsset,
} from "@fetchr/core"
import type { PlayerFormat, PlayerResponse } from "./schema.ts"

function failure(code: ExtractFailure["code"], message: string): ExtractFailure {
  return { code, message }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:"
  } catch {
    return false
  }
}

function hasDrm(format: PlayerFormat): boolean {
  return format.drmFamilies !== undefined && format.drmFamilies.length > 0
}

function isBareUrl(
  format: PlayerFormat,
): format is PlayerFormat & { readonly url: string } {
  return format.url !== undefined && isHttpUrl(format.url) && !hasDrm(format)
}

function muxFromAdaptive(
  adaptive: readonly PlayerFormat[],
): Extract<VideoAsset["delivery"], { type: "mux" }> | undefined {
  const video = adaptive
    .filter(isBareUrl)
    .filter((format) => format.mimeType?.startsWith("video/") === true)
    .sort(byQuality)[0]
  const audio = adaptive
    .filter(isBareUrl)
    .filter((format) => format.mimeType?.startsWith("audio/") === true)
    .sort(byQuality)[0]
  if (video === undefined || audio === undefined) return undefined
  return {
    type: "mux",
    outputContainer: "mp4",
    video: { url: video.url },
    audio: { url: audio.url },
  }
}

function isProgressive(
  format: PlayerFormat,
): format is PlayerFormat & { readonly url: string } {
  if (format.url === undefined || !isHttpUrl(format.url)) return false
  if (hasDrm(format)) return false
  const mimeType = format.mimeType
  if (mimeType === undefined || !mimeType.startsWith("video/")) return false
  return mimeType.includes(",")
}

function playabilityFailure(player: PlayerResponse): ExtractFailure | undefined {
  const status = player.playabilityStatus.status
  const reason = player.playabilityStatus.reason ?? ""
  const isPrivate =
    player.videoDetails?.isPrivate === true || /private/i.test(reason)
  if (isPrivate) {
    return failure(
      "PRIVATE_MEDIA",
      reason.length > 0 ? reason : "This video is private.",
    )
  }
  if (/drm/i.test(reason)) {
    return failure("DRM_PROTECTED", reason)
  }
  if (status === "OK") return undefined
  if (status === "ERROR") {
    return failure(
      "MEDIA_NOT_FOUND",
      reason.length > 0 ? reason : "This video is unavailable.",
    )
  }
  if (status === "LOGIN_REQUIRED" || status === "CONTENT_CHECK_REQUIRED") {
    return failure(
      "LOGIN_REQUIRED",
      reason.length > 0
        ? reason
        : "YouTube asked for a login. Login is not supported.",
    )
  }
  if (/not available in your country|geo/i.test(reason)) {
    return failure("GEO_BLOCKED", reason)
  }
  return failure(
    "SOURCE_UNAVAILABLE",
    reason.length > 0 ? reason : `YouTube playability status was ${status}.`,
  )
}

function byQuality(left: PlayerFormat, right: PlayerFormat): number {
  const height = (right.height ?? 0) - (left.height ?? 0)
  if (height !== 0) return height
  return (right.bitrate ?? 0) - (left.bitrate ?? 0)
}

function videoCodec(mimeType: string | undefined): string | undefined {
  if (mimeType === undefined) return undefined
  const quoted = /codecs="([^"]+)"/.exec(mimeType)?.[1]
  const codec = quoted?.split(",")[0]?.trim()
  return codec === undefined || codec.length === 0 ? undefined : codec
}

function container(mimeType: string | undefined): string | undefined {
  if (mimeType === undefined) return undefined
  return /^video\/([A-Za-z0-9]+)/.exec(mimeType)?.[1]
}

function largestThumbnail(
  thumbnails: ReadonlyArray<{
    readonly url: string
    readonly width?: number
  }>,
): string | undefined {
  let best: { readonly url: string; readonly width: number } | undefined
  for (const thumbnail of thumbnails) {
    const width = thumbnail.width ?? 0
    if (best === undefined || width >= best.width) {
      best = { url: thumbnail.url, width }
    }
  }
  return best?.url
}

function authorFrom(
  details: NonNullable<PlayerResponse["videoDetails"]>,
  profileUrl: string | undefined,
): Author | undefined {
  const author: {
    id?: string
    name?: string
    profileUrl?: string
  } = {}
  if (details.channelId !== undefined) author.id = details.channelId
  if (details.author !== undefined) author.name = details.author
  if (profileUrl !== undefined) author.profileUrl = profileUrl
  if (author.id === undefined && author.name === undefined && author.profileUrl === undefined) {
    return undefined
  }
  return author
}

function videoAsset(
  id: string,
  format: PlayerFormat & { readonly url: string },
  thumbnail: string | undefined,
): VideoAsset {
  const codec = videoCodec(format.mimeType)
  const formatContainer = container(format.mimeType)
  return {
    type: "video",
    id,
    // googlevideo does not grant the page CORS. A cross-origin download attribute is ignored, so proxy the file instead.
    delivery: unsignedProxy(format.url),
    ...(format.width === undefined ? {} : { width: format.width }),
    ...(format.height === undefined ? {} : { height: format.height }),
    ...(format.fps === undefined ? {} : { fps: format.fps }),
    ...(codec === undefined ? {} : { codec }),
    ...(formatContainer === undefined ? {} : { container: formatContainer }),
    ...(format.bitrate === undefined ? {} : { bitrate: format.bitrate }),
    ...(thumbnail === undefined ? {} : { thumbnail }),
  }
}

export function mediaPostFromPlayer(
  player: PlayerResponse,
  fallbackId: string,
): Effect.Effect<MediaPost, ExtractFailure> {
  const blocked = playabilityFailure(player)
  if (blocked !== undefined) return Effect.fail(blocked)

  const details = player.videoDetails
  const detailsId = details?.videoId
  if (detailsId !== undefined && detailsId !== fallbackId) {
    return Effect.fail(
      failure(
        "SCHEMA_CHANGED",
        "YouTube player response video id did not match the requested video.",
      ),
    )
  }

  const formats = player.streamingData?.formats ?? []
  const adaptive = player.streamingData?.adaptiveFormats ?? []
  const chosen = formats.filter(isProgressive).sort(byQuality)[0]
  const split = chosen === undefined ? muxFromAdaptive(adaptive) : undefined
  if (chosen === undefined && split === undefined) {
    if ([...formats, ...adaptive].some(hasDrm)) {
      return Effect.fail(
        failure("DRM_PROTECTED", "This video is protected by DRM."),
      )
    }
    return Effect.fail(
      failure(
        "SOURCE_UNAVAILABLE",
        "YouTube player response had no complete video file URL.",
      ),
    )
  }

  const id = detailsId ?? fallbackId
  const microformat = player.microformat?.playerMicroformatRenderer
  const thumbnail =
    (details?.thumbnail === undefined
      ? undefined
      : largestThumbnail(details.thumbnail.thumbnails)) ??
    (microformat?.thumbnail === undefined
      ? undefined
      : largestThumbnail(microformat.thumbnail.thumbnails))
  const profileUrl =
    microformat?.ownerProfileUrl ??
    (details?.channelId === undefined
      ? undefined
      : `https://www.youtube.com/channel/${details.channelId}`)
  const author = details === undefined ? undefined : authorFrom(details, profileUrl)

  return Effect.succeed({
    platform: "youtube",
    id,
    canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
    media: [
      chosen !== undefined
        ? videoAsset(id, chosen, thumbnail)
        : {
            type: "video" as const,
            id: `${id}-mux`,
            // When there is no complete file, picture and audio stay separate and the client muxes them.
            delivery: split!,
            ...(thumbnail === undefined ? {} : { thumbnail }),
          },
    ],
    ...(author === undefined ? {} : { author }),
    ...(details?.title === undefined ? {} : { title: details.title }),
    ...(details?.shortDescription === undefined
      ? {}
      : { description: details.shortDescription }),
    ...(thumbnail === undefined ? {} : { thumbnail }),
    ...(microformat?.publishDate === undefined
      ? {}
      : { publishedAt: microformat.publishDate }),
  })
}
