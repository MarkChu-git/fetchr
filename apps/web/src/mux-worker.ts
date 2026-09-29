/// <reference lib="webworker" />

import { muxSplitStreams } from "@fetchr/media-browser"

export interface MuxJob {
  readonly videoUrl: string
  readonly audioUrl: string
}

export type MuxWorkerResult =
  | { readonly type: "unreadable" }
  | { readonly type: "file"; readonly buffer: ArrayBuffer }
  | { readonly type: "failed"; readonly message: string }

/**
 * Muxing runs in a worker. Copying picture and audio takes a while.
 * The page thread only hands the result to the download, so the input
 * and scrolling stay responsive.
 * Stop when the bytes cannot be read. Do not transcode here.
 */
self.onmessage = (event: MessageEvent<MuxJob>) => {
  void run(event.data)
}

async function run(job: MuxJob): Promise<void> {
  try {
    const [video, audio] = await Promise.all([
      fetch(job.videoUrl),
      fetch(job.audioUrl),
    ])
    if (!video.ok || !audio.ok || video.body === null || audio.body === null) {
      reply({ type: "unreadable" })
      return
    }
    const muxed = await muxSplitStreams({
      video: video.body,
      audio: audio.body,
    })
    const buffer = await new Response(muxed.stream).arrayBuffer()
    reply({ type: "file", buffer }, [buffer])
  } catch (error) {
    reply({
      type: "failed",
      message: error instanceof Error ? error.message : "mux failed",
    })
  }
}

function reply(message: MuxWorkerResult, transfer: Transferable[] = []): void {
  self.postMessage(message, transfer)
}
