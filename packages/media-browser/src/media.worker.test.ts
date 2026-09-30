import { expect, test } from "bun:test"
import { muxFunctionName, muxSplitStreams } from "./media.worker"

test("worker entry names the exported mux function", () => {
  expect(muxFunctionName).toBe("muxSplitStreams")
  expect(typeof muxSplitStreams).toBe("function")
  expect(muxSplitStreams.name).toBe(muxFunctionName)
})
