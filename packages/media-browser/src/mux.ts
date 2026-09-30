import {
  ALL_FORMATS,
  AppendOnlyStreamTarget,
  Conversion,
  ConversionCanceledError,
  Input,
  Mp4OutputFormat,
  Output,
  ReadableStreamSource,
} from "mediabunny"

export const muxSourceKinds = ["video", "audio"] as const

export type MuxSourceKind = (typeof muxSourceKinds)[number]

export const muxOutputContainer = "mp4" as const

export type MuxOutputContainer = typeof muxOutputContainer

export interface MuxSourceStreams {
  readonly video?: ReadableStream<Uint8Array> | null
  readonly audio?: ReadableStream<Uint8Array> | null
}

export type MuxChoice =
  | {
      readonly ok: false
      readonly missing: readonly MuxSourceKind[]
    }
  | {
      readonly ok: true
      readonly outputContainer: MuxOutputContainer
      readonly video: ReadableStream<Uint8Array>
      readonly audio: ReadableStream<Uint8Array>
    }

export interface MuxedMp4 {
  readonly outputContainer: MuxOutputContainer
  readonly stream: ReadableStream<Uint8Array>
  readonly done: Promise<void>
}

export class MuxFailed extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MuxFailed"
  }
}

export function chooseMux(sources: MuxSourceStreams): MuxChoice {
  const missing: MuxSourceKind[] = []
  if (sources.video == null) missing.push("video")
  if (sources.audio == null) missing.push("audio")
  if (missing.length > 0) return { ok: false, missing }

  const video = sources.video
  const audio = sources.audio
  if (video == null || audio == null) return { ok: false, missing }

  return { ok: true, outputContainer: muxOutputContainer, video, audio }
}

export async function muxSplitStreams(streams: {
  readonly video: ReadableStream<Uint8Array>
  readonly audio: ReadableStream<Uint8Array>
}): Promise<MuxedMp4> {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  // Fragmented MP4 writes in order, so a large file is not held for a moov rewrite.
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "fragmented" }),
    target: new AppendOnlyStreamTarget(writable),
  })
  const videoInput = new Input({
    formats: ALL_FORMATS,
    source: new ReadableStreamSource(streams.video),
  })
  const audioInput = new Input({
    formats: ALL_FORMATS,
    source: new ReadableStreamSource(streams.audio),
  })

  let videoConversion: Conversion
  let audioConversion: Conversion
  try {
    const copy = { mode: "forced" } as const
    videoConversion = await Conversion.init({
      input: videoInput,
      output,
      composable: true,
      tracks: "primary",
      audio: { discard: true },
      copy,
      showWarnings: false,
    })
    audioConversion = await Conversion.init({
      input: audioInput,
      output,
      composable: true,
      tracks: "primary",
      video: { discard: true },
      copy,
      showWarnings: false,
    })
    requireCopied(videoConversion, "video")
    requireCopied(audioConversion, "audio")
  } catch (error) {
    videoInput.dispose()
    audioInput.dispose()
    await writable.abort(error).catch(() => undefined)
    await output.cancel().catch(() => undefined)
    throw error instanceof MuxFailed ? error : new MuxFailed(messageOf(error))
  }

  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    void videoConversion.cancel().catch(() => undefined)
    void audioConversion.cancel().catch(() => undefined)
    void output.cancel().catch(() => undefined)
  }

  const done = runMux({
    output,
    writable,
    videoConversion,
    audioConversion,
    videoInput,
    audioInput,
    stopped: () => stopped,
  })
  return {
    outputContainer: muxOutputContainer,
    stream: cancelWhenConsumerStops(readable, stop),
    done,
  }
}

function requireCopied(conversion: Conversion, kind: MuxSourceKind): void {
  const kept = conversion.utilizedTracks.some((track) => track.type === kind)
  if (kept) return

  const reasons = conversion.discardedTracks
    .filter((entry) => entry.reason !== "discarded_by_user")
    .map((entry) => entry.reason)
  const detail = reasons.length > 0 ? reasons.join(", ") : "no track"
  throw new MuxFailed(`cannot copy ${kind} without transcoding (${detail})`)
}

async function runMux(args: {
  readonly output: Output
  readonly writable: WritableStream<Uint8Array>
  readonly videoConversion: Conversion
  readonly audioConversion: Conversion
  readonly videoInput: Input
  readonly audioInput: Input
  readonly stopped: () => boolean
}): Promise<void> {
  try {
    await args.output.start()
    await Promise.all([
      args.videoConversion.execute(),
      args.audioConversion.execute(),
    ])
    if (args.stopped()) throw new MuxFailed("mux canceled")
    await args.output.finalize()
  } catch (error) {
    await args.writable.abort(error).catch(() => undefined)
    if (args.stopped() || error instanceof ConversionCanceledError) {
      throw new MuxFailed("mux canceled")
    }
    throw error instanceof MuxFailed ? error : new MuxFailed(messageOf(error))
  } finally {
    args.videoInput.dispose()
    args.audioInput.dispose()
  }
}

function cancelWhenConsumerStops(
  source: ReadableStream<Uint8Array>,
  stop: () => void,
): ReadableStream<Uint8Array> {
  const reader = source.getReader()
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await reader.read()
      if (next.done) {
        controller.close()
        return
      }
      controller.enqueue(next.value)
    },
    cancel(reason) {
      stop()
      return reader.cancel(reason)
    },
  })
}

export function messageOf(error: unknown): string {
  if (error instanceof Error && error.message !== "") return error.message
  return "mux failed"
}
