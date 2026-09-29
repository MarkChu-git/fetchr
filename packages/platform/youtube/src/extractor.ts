import { Effect, Schema } from "effect"
import type {
  CanonicalResource,
  ExtractFailure,
  Extractor,
  MediaPost,
  Transport,
  VideoAsset,
} from "@fetchr/core"
import { isYoutubeVideoId, matchYoutubeUrl, videoIdFromUrl } from "./match.ts"
import { mediaPostFromPlayer } from "./parser.ts"
import { playerResponseJsonSchema } from "./schema.ts"

interface YtFormat {
  readonly url?: string
  readonly mime_type?: string
  readonly has_audio?: boolean
  readonly has_video?: boolean
  readonly width?: number
  readonly height?: number
}

interface YtInfo {
  readonly basic_info?: {
    readonly title?: string
    readonly author?: string
    readonly channel_id?: string
    readonly short_description?: string
  }
  readonly playability_status?: { readonly status?: string; readonly reason?: string }
  readonly streaming_data?: {
    readonly formats?: readonly YtFormat[]
    readonly adaptive_formats?: readonly YtFormat[]
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function asInfo(value: unknown): YtInfo {
  if (!isRecord(value)) return {}
  return value as YtInfo
}

function failure(code: ExtractFailure["code"], message: string): ExtractFailure {
  return { code, message }
}

function videoIdFromResource(resource: CanonicalResource): string | undefined {
  if (resource.id !== undefined && isYoutubeVideoId(resource.id)) return resource.id
  return videoIdFromUrl(resource.url)
}

/** Paired with the clientVersion below. Change them together. Do not leave a browser User-Agent in place. */
const androidClientVersion = "21.03.36"
const androidUserAgent =
  "com.google.android.youtube/21.03.36(Linux; U; Android 16; en_US; SM-S908E Build/TP1A.220624.014) gzip"

const readPlayer = Effect.fnUntraced(function* (
  resource: CanonicalResource,
  transport: Transport,
): Effect.fn.Return<MediaPost, ExtractFailure> {
  const id = videoIdFromResource(resource)
  if (id === undefined) {
    return yield* Effect.fail(
      failure("INVALID_URL", "YouTube URL has no video id."),
    )
  }

  // The youtubei.js worker build throws in the default executor, and its Cache writes non-URL keys, so this path does not use it.
  // This ANDROID version and User-Agent pair comes from the client youtubei.js publishes.
  // It returns a complete file URL directly. When the User-Agent is missing, the Worker fills in a browser identifier.
  // A browser identifier with this client is answered 400, so this request must send its own.
  // Do not decrypt signatureCipher, and do not log in.
  const response = yield* transport.request(
    new Request(
      "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "user-agent": androidUserAgent,
        },
        body: JSON.stringify({
          videoId: id,
          context: {
            client: {
              clientName: "ANDROID",
              clientVersion: androidClientVersion,
              androidSdkVersion: 36,
              hl: "en",
              gl: "US",
            },
          },
        }),
      },
    ),
  )
  if (response.status === 404) {
    return yield* Effect.fail(
      failure("MEDIA_NOT_FOUND", "YouTube video was not found."),
    )
  }
  if (response.status === 429) {
    return yield* Effect.fail(
      failure("RATE_LIMITED", "YouTube rate limited the request."),
    )
  }
  if (!response.ok) {
    // A bare innertube request often returns 400. Ask youtubei.js for the public player info instead.
    return yield* fromYoutubei(id)
  }

  const text = yield* Effect.tryPromise({
    try: () => response.text(),
    catch: () =>
      failure("SOURCE_UNAVAILABLE", "YouTube response body could not be read."),
  })
  const player = yield* Schema.decodeUnknownEffect(playerResponseJsonSchema)(
    text,
  ).pipe(
    Effect.mapError((error) =>
      failure(
        "SCHEMA_CHANGED",
        `YouTube player response did not match the schema: ${error.message}`,
      ),
    ),
  )
  const parsed = yield* mediaPostFromPlayer(player, id).pipe(
    Effect.catchIf(
      (error) => error.code === "SOURCE_UNAVAILABLE",
      () => fromYoutubei(id),
    ),
  )
  return parsed
})

/**
 * Watch pages often omit media URLs now. youtubei.js uses a local session to ask for public player info.
 * No login and no DRM bypass. This runs only after parsing fails. Fixture tests never reach YouTube.
 */
let evaluatorReady = false

async function openYoutube(id: string): Promise<{
  readonly title?: string
  readonly author?: string
  readonly channelId?: string
  readonly description?: string
  readonly status?: string
  readonly reason?: string
  readonly fileUrl?: string
}> {
  const { Innertube, Platform } = await import("youtubei.js")
  if (!evaluatorReady) {
    // Run only the transform youtubei.js extracted from the player, turning the public n / signature values into a URL.
    // The input is not the link the user pasted.
    Platform.shim.eval = async (data, env) => {
      const properties: string[] = []
      const runtime = env as { n?: unknown; sig?: unknown }
      if (typeof runtime.n === "string") {
        properties.push(`n: exportedVars.nFunction(${JSON.stringify(runtime.n)})`)
      }
      if (typeof runtime.sig === "string") {
        properties.push(`sig: exportedVars.sigFunction(${JSON.stringify(runtime.sig)})`)
      }
      const code = `${data.output}\nreturn { ${properties.join(", ")} }`
      return new Function(code)()
    }
    evaluatorReady = true
  }
  const youtube = await Innertube.create({ generate_session_locally: true })
  const info = await youtube.getBasicInfo(id)
  const status = info.playability_status?.status
  const reason = info.playability_status?.reason
  const progressive = info.streaming_data?.formats?.[0]
  const video = info.streaming_data?.adaptive_formats?.find((format) =>
    format.mime_type.startsWith("video/"),
  )
  const audio = info.streaming_data?.adaptive_formats?.find((format) =>
    format.mime_type.startsWith("audio/"),
  )
  const chosen = progressive ?? video
  let fileUrl: string | undefined
  if (chosen !== undefined) {
    try {
      const deciphered = await chosen.decipher(youtube.session.player)
      if (deciphered.startsWith("https://")) fileUrl = deciphered
    } catch {
      fileUrl = undefined
    }
  }
  const described = {
    ...(info.basic_info.title === undefined ? {} : { title: info.basic_info.title }),
    ...(info.basic_info.author === undefined ? {} : { author: info.basic_info.author }),
    ...(info.basic_info.channel_id === undefined
      ? {}
      : { channelId: info.basic_info.channel_id }),
    ...(info.basic_info.short_description === undefined
      ? {}
      : { description: info.basic_info.short_description }),
    ...(status === undefined ? {} : { status }),
    ...(reason === undefined ? {} : { reason }),
  }
  if (fileUrl === undefined && video !== undefined && audio !== undefined) {
    let videoUrl = ""
    let audioUrl = ""
    try {
      videoUrl = await video.decipher(youtube.session.player)
      audioUrl = await audio.decipher(youtube.session.player)
    } catch {
      videoUrl = ""
      audioUrl = ""
    }
    if (videoUrl.startsWith("https://") && audioUrl.startsWith("https://")) {
      return { ...described, fileUrl: `mux:${videoUrl}\n${audioUrl}` }
    }
  }
  return {
    ...described,
    ...(fileUrl === undefined ? {} : { fileUrl }),
  }
}

const fromYoutubei = Effect.fnUntraced(function* (
  id: string,
): Effect.fn.Return<MediaPost, ExtractFailure> {
  const info = yield* Effect.tryPromise({
    try: () => openYoutube(id),
    catch: (error) =>
      failure(
        "SOURCE_UNAVAILABLE",
        error instanceof Error
          ? error.message
          : "YouTube player session could not be opened.",
      ),
  })
  if (info.status === "LOGIN_REQUIRED") {
    return yield* Effect.fail(failure("LOGIN_REQUIRED", info.reason || "Login required"))
  }
  if (info.status === "ERROR") {
    return yield* Effect.fail(failure("MEDIA_NOT_FOUND", info.reason || "Video unavailable"))
  }
  if (info.fileUrl === undefined) {
    return yield* Effect.fail(
      failure("SOURCE_UNAVAILABLE", "YouTube did not return a playable file URL."),
    )
  }
  const title = info.title
  const authorName = info.author
  const asset: VideoAsset = info.fileUrl.startsWith("mux:")
    ? {
        type: "video",
        id: `${id}-mux`,
        delivery: {
          type: "mux",
          outputContainer: "mp4",
          video: { url: info.fileUrl.slice(4).split("\n")[0] ?? "" },
          audio: { url: info.fileUrl.slice(4).split("\n")[1] ?? "" },
        },
      }
    : {
        type: "video",
        id,
        delivery: { type: "direct", url: info.fileUrl },
      }
  return {
    platform: "youtube",
    id,
    canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
    media: [asset],
    ...(title === undefined ? {} : { title }),
    ...(info.description === undefined ? {} : { description: info.description }),
    ...(authorName === undefined
      ? {}
      : {
          author: {
            name: authorName,
            ...(info.channelId === undefined ? {} : { id: info.channelId }),
          },
        }),
  }
})

export const youtubeExtractor: Extractor = {
  platform: "youtube",
  match: matchYoutubeUrl,
  extract: (resource, transport) =>
    readPlayer(resource, transport).pipe(
      Effect.catchDefect((defect) =>
        Effect.fail(
          failure(
            "EXTRACTOR_BROKEN",
            defect instanceof Error
              ? defect.message
              : "YouTube extractor failed.",
          ),
        ),
      ),
    ),
}
