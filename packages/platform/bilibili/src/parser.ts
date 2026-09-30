import type {
  Author,
  Delivery,
  ExtractFailure,
  MediaPost,
  MediaSource,
  VideoAsset,
} from "@fetchr/core"
import { notFound } from "./http"
import type { DashStream, PlayData, ViewData } from "./schema"

interface ChosenStream {
  readonly url: string
  readonly bandwidth?: number
  readonly width?: number
  readonly height?: number
  readonly codecs?: string
  readonly frameRate?: string
}

function streamUrl(stream: DashStream): string | undefined {
  const url = stream.baseUrl ?? stream.base_url
  if (url === undefined || url.length === 0) return undefined
  return url
}

function mimeOf(stream: DashStream): string | undefined {
  return stream.mimeType ?? stream.mime_type
}

function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase()
  } catch {
    const path = url.split("?")[0] ?? url
    return path.toLowerCase()
  }
}

function isDashManifest(url: string, mimeType: string | undefined): boolean {
  if (mimeType === "application/dash+xml") return true
  return pathnameOf(url).endsWith(".mpd")
}

function bestStream(
  streams: readonly DashStream[] | null | undefined,
): ChosenStream | undefined {
  if (streams == null) return undefined
  let winner: ChosenStream | undefined
  let winnerBandwidth = -1
  for (const stream of streams) {
    const url = streamUrl(stream)
    if (url === undefined || isDashManifest(url, mimeOf(stream))) continue
    const bandwidth = stream.bandwidth ?? 0
    if (winner !== undefined && bandwidth <= winnerBandwidth) continue
    const frameRate = stream.frameRate ?? stream.frame_rate
    winner = {
      url,
      ...(stream.bandwidth === undefined ? {} : { bandwidth: stream.bandwidth }),
      ...(stream.width === undefined ? {} : { width: stream.width }),
      ...(stream.height === undefined ? {} : { height: stream.height }),
      ...(stream.codecs === undefined ? {} : { codecs: stream.codecs }),
      ...(frameRate === undefined ? {} : { frameRate }),
    }
    winnerBandwidth = bandwidth
  }
  return winner
}

/**
 * A browser request to these CDNs sends this site's Referer, and Akamai answers 403.
 * Put the header on the source so signing rewrites the URL to a same-origin /download and the browser never touches the CDN.
 * A Worker fetch with no User-Agent is also answered 403. The download entry fills that in.
 */
const bilibiliHeaders = { Referer: "https://www.bilibili.com/" } as const

function bilibiliSource(url: string): MediaSource {
  return { url, headers: bilibiliHeaders }
}

function fpsFrom(frameRate: string | undefined): number | undefined {
  if (frameRate === undefined) return undefined
  const parsed = Number(frameRate)
  return Number.isFinite(parsed) ? parsed : undefined
}

function publishedFrom(pubdate: number | undefined): string | undefined {
  if (pubdate === undefined) return undefined
  const date = new Date(pubdate * 1000)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}

function authorFrom(owner: ViewData["owner"]): Author | undefined {
  if (owner === undefined) return undefined
  const author: Author = {
    ...(owner.mid === undefined ? {} : { id: String(owner.mid) }),
    ...(owner.name === undefined ? {} : { name: owner.name }),
    ...(owner.face === undefined ? {} : { avatar: owner.face }),
    ...(owner.mid === undefined
      ? {}
      : { profileUrl: `https://space.bilibili.com/${owner.mid}` }),
  }
  if (
    author.id === undefined &&
    author.name === undefined &&
    author.avatar === undefined &&
    author.profileUrl === undefined
  ) {
    return undefined
  }
  return author
}

function videoAsset(
  bvid: string,
  delivery: Delivery,
  view: ViewData,
  stream: ChosenStream | undefined,
): VideoAsset {
  const fps = fpsFrom(stream?.frameRate)
  return {
    type: "video",
    id: bvid,
    delivery,
    ...(stream?.width === undefined ? {} : { width: stream.width }),
    ...(stream?.height === undefined ? {} : { height: stream.height }),
    ...(fps === undefined ? {} : { fps }),
    ...(stream?.codecs === undefined ? {} : { codec: stream.codecs }),
    ...(stream?.bandwidth === undefined ? {} : { bitrate: stream.bandwidth }),
    ...(view.pic === undefined ? {} : { thumbnail: view.pic }),
  }
}

function assemble(
  bvid: string,
  view: ViewData,
  delivery: Delivery,
  stream: ChosenStream | undefined,
): MediaPost {
  const author = authorFrom(view.owner)
  const publishedAt = publishedFrom(view.pubdate)
  return {
    platform: "bilibili",
    id: bvid,
    canonicalUrl: `https://www.bilibili.com/video/${bvid}`,
    media: [videoAsset(bvid, delivery, view, stream)],
    ...(view.title === undefined ? {} : { title: view.title }),
    ...(view.desc === undefined ? {} : { description: view.desc }),
    ...(view.pic === undefined ? {} : { thumbnail: view.pic }),
    ...(publishedAt === undefined ? {} : { publishedAt }),
    ...(author === undefined ? {} : { author }),
  }
}

function dashManifestUrl(play: PlayData): string | undefined {
  const groups = [play.dash?.video, play.dash?.audio]
  for (const group of groups) {
    if (group == null) continue
    for (const stream of group) {
      const url = streamUrl(stream)
      if (url !== undefined && isDashManifest(url, mimeOf(stream))) return url
    }
  }
  const segments = play.durl
  if (segments === undefined) return undefined
  for (const segment of segments) {
    if (isDashManifest(segment.url, undefined)) return segment.url
  }
  return undefined
}

function progressiveUrl(play: PlayData): string | undefined {
  const segments = play.durl
  if (segments === undefined || segments.length !== 1) return undefined
  const url = segments[0]?.url
  if (url === undefined || url.length === 0 || isDashManifest(url, undefined)) {
    return undefined
  }
  return url
}

export function mediaPostFrom(
  bvid: string,
  view: ViewData,
  play: PlayData,
): MediaPost | ExtractFailure {
  const video = bestStream(play.dash?.video)
  const audio = bestStream(play.dash?.audio)
  if (video !== undefined && audio !== undefined) {
    return assemble(
      bvid,
      view,
      {
        type: "mux",
        outputContainer: "mp4",
        video: bilibiliSource(video.url),
        audio: bilibiliSource(audio.url),
      },
      video,
    )
  }

  // Separate elementary streams are muxed on device. An MPD url stays a playlist.
  const manifest = dashManifestUrl(play)
  if (manifest !== undefined) {
    return assemble(
      bvid,
      view,
      { type: "playlist", protocol: "dash", url: manifest },
      undefined,
    )
  }

  const file = progressiveUrl(play)
  if (file !== undefined) {
    // A complete file still cannot go straight to the browser. The Referer would stay this site's, and the CDN would refuse it.
    return assemble(
      bvid,
      view,
      { type: "direct", url: file, headers: bilibiliHeaders },
      undefined,
    )
  }

  return notFound
}
