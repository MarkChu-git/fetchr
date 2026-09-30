import { expect, test } from "bun:test"
import { chooseMux } from "./mux"

function stream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.close()
    },
  })
}

test("choosing mux is rejected when the video source is missing", () => {
  const missingVideo = chooseMux({ audio: stream() })
  const nullVideo = chooseMux({ video: null, audio: stream() })

  expect(missingVideo.ok).toBe(false)
  expect(nullVideo.ok).toBe(false)
  if (missingVideo.ok || nullVideo.ok) return
  expect(missingVideo.missing).toEqual(["video"])
  expect(nullVideo.missing).toEqual(["video"])
})

test("choosing mux is rejected when the audio source is missing", () => {
  const missingAudio = chooseMux({ video: stream() })
  const nullAudio = chooseMux({ video: stream(), audio: null })

  expect(missingAudio.ok).toBe(false)
  expect(nullAudio.ok).toBe(false)
  if (missingAudio.ok || nullAudio.ok) return
  expect(missingAudio.missing).toEqual(["audio"])
  expect(nullAudio.missing).toEqual(["audio"])
})

test("choosing mux outputs mp4 when both sources are present", () => {
  const chosen = chooseMux({ video: stream(), audio: stream() })

  expect(chosen.ok).toBe(true)
  if (!chosen.ok) return
  expect(chosen.outputContainer).toBe("mp4")
})

test("choosing mux is rejected when both sources are missing", () => {
  const missing = chooseMux({})
  const nulled = chooseMux({ video: null, audio: null })

  expect(missing.ok).toBe(false)
  expect(nulled.ok).toBe(false)
  if (missing.ok || nulled.ok) return
  expect(missing.missing).toEqual(["video", "audio"])
  expect(nulled.missing).toEqual(["video", "audio"])
})
