import { chooseMux, messageOf, muxSplitStreams } from "./mux"
import type { MuxSourceKind, MuxSourceStreams } from "./mux"

export { muxSplitStreams }

export const muxFunctionName = "muxSplitStreams" as const

export interface MuxWorkerRequest {
  readonly video?: ReadableStream<Uint8Array> | null
  readonly audio?: ReadableStream<Uint8Array> | null
}

export type MuxWorkerResponse =
  | {
      readonly type: "rejected"
      readonly missing: readonly MuxSourceKind[]
    }
  | {
      readonly type: "started"
      readonly outputContainer: "mp4"
      readonly stream: ReadableStream<Uint8Array>
    }
  | {
      // Bytes may still be buffered in `stream`. End of file is the stream closing.
      readonly type: "finished"
    }
  | {
      readonly type: "failed"
      readonly message: string
    }

export interface MuxWorkerHost {
  onmessage: ((event: MessageEvent<MuxWorkerRequest>) => void) | null
  postMessage(message: MuxWorkerResponse, transfer?: Transferable[]): void
}

export function attachMuxWorker(host: MuxWorkerHost): void {
  host.onmessage = (event) => {
    void respond(host, event.data)
  }
}

async function respond(host: MuxWorkerHost, data: unknown): Promise<void> {
  const choice = chooseMux(sourcesFromMessage(data))
  if (!choice.ok) {
    host.postMessage({ type: "rejected", missing: choice.missing })
    return
  }

  try {
    const muxed = await muxSplitStreams({
      video: choice.video,
      audio: choice.audio,
    })
    let delivered = false
    try {
      host.postMessage(
        {
          type: "started",
          outputContainer: muxed.outputContainer,
          stream: muxed.stream,
        },
        [muxed.stream],
      )
      delivered = true
      await muxed.done
      host.postMessage({ type: "finished" })
    } catch (error) {
      if (!delivered) await muxed.stream.cancel(error).catch(() => undefined)
      await muxed.done.catch(() => undefined)
      throw error
    }
  } catch (error) {
    host.postMessage({ type: "failed", message: messageOf(error) })
  }
}

function sourcesFromMessage(data: unknown): MuxSourceStreams {
  if (typeof data !== "object" || data === null) return {}
  const body = data as { readonly video?: unknown; readonly audio?: unknown }
  return {
    video: byteStream(body.video),
    audio: byteStream(body.audio),
  }
}

function byteStream(value: unknown): ReadableStream<Uint8Array> | null {
  if (typeof ReadableStream !== "undefined" && value instanceof ReadableStream) {
    // instanceof narrows to ReadableStream<any>; the mux reader only ever pulls bytes.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return value as ReadableStream<Uint8Array>
  }
  return null
}

declare const DedicatedWorkerGlobalScope: (new () => object) | undefined

function runningAsDedicatedWorker(): boolean {
  return (
    typeof DedicatedWorkerGlobalScope !== "undefined" &&
    globalThis instanceof DedicatedWorkerGlobalScope
  )
}

// Bun tests import this module on the main thread. Attach only inside a worker.
if (runningAsDedicatedWorker()) {
  // The dedicated worker scope carries the message ports MuxWorkerHost needs.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, typescript/no-unnecessary-type-assertion
  attachMuxWorker(globalThis as unknown as MuxWorkerHost)
}
