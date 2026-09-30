import { expect, test } from "bun:test"
import { liveUrlFromPreview, requireSecret, versionUploadFrom, workersDevUrlFrom } from "./publish-worker.ts"

test("requireSecret rejects a missing or short value", () => {
  expect(() => requireSecret(undefined)).toThrow(/at least 16/)
  expect(() => requireSecret("short")).toThrow(/at least 16/)
})

test("requireSecret accepts a long enough value", () => {
  const secret = "x".repeat(16)
  expect(requireSecret(secret)).toBe(secret)
})

test("liveUrlFromPreview drops the version prefix", () => {
  expect(liveUrlFromPreview("https://abcdef12-fetchr-web.account.workers.dev")).toBe(
    "https://fetchr-web.account.workers.dev",
  )
})

test("liveUrlFromPreview rejects a URL that is not a version preview", () => {
  expect(() => liveUrlFromPreview("https://fetchr-web.account.workers.dev")).toThrow(/version prefix/)
  expect(() => liveUrlFromPreview("https://not-a-prefix-fetchr-web.account.workers.dev")).toThrow(/version prefix/)
  expect(() => liveUrlFromPreview("https://abcdef12-other.account.workers.dev")).toThrow(/workers.dev/)
})

test("versionUploadFrom reads the last upload event", () => {
  const jsonl = [
    JSON.stringify({ type: "version-upload", version_id: "old", preview_url: "https://old.example" }),
    JSON.stringify({
      type: "version-upload",
      version_id: "11111111-1111-1111-1111-111111111111",
      preview_url: "https://abcdef12-fetchr-web.account.workers.dev",
    }),
  ].join("\n")

  expect(versionUploadFrom(jsonl)).toEqual({
    versionId: "11111111-1111-1111-1111-111111111111",
    previewUrl: "https://abcdef12-fetchr-web.account.workers.dev",
  })
})

test("versionUploadFrom fails closed when the preview URL is absent", () => {
  const jsonl = JSON.stringify({ type: "version-upload", version_id: "abc", preview_url: "" })
  expect(() => versionUploadFrom(jsonl)).toThrow(/preview URL/)
})

test("workersDevUrlFrom prefers the Worker host", () => {
  const jsonl = JSON.stringify({
    type: "deploy",
    targets: ["example.com/path", "https://other.account.workers.dev", "https://fetchr-web.account.workers.dev"],
  })
  expect(workersDevUrlFrom(jsonl)).toBe("https://fetchr-web.account.workers.dev")
})
