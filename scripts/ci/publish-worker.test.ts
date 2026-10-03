import { expect, test } from "bun:test"
import { requireSecret } from "./publish-worker.ts"
import { deploymentVersionFrom, liveUrlFromPreview, versionUploadFrom, workersDevUrlFrom } from "../release/cf.ts"

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

const cfUploadPanel = `
┌  Upload
│  Worker Version ID: 11111111-1111-1111-1111-111111111111
│  Version Preview URL: https://abcdef12-fetchr-web.account.workers.dev
└  Done
`

test("versionUploadFrom reads the version id and preview URL from cf output", () => {
  expect(versionUploadFrom(cfUploadPanel)).toEqual({
    versionId: "11111111-1111-1111-1111-111111111111",
    previewUrl: "https://abcdef12-fetchr-web.account.workers.dev",
  })
})

test("versionUploadFrom fails closed when either field is absent", () => {
  expect(() => versionUploadFrom("no ids here")).toThrow(/preview URL/)
  expect(() =>
    versionUploadFrom("Version 11111111-1111-1111-1111-111111111111 without a preview"),
  ).toThrow(/preview URL/)
  expect(() =>
    versionUploadFrom("https://abcdef12-fetchr-web.account.workers.dev without an id"),
  ).toThrow(/preview URL/)
})

test("workersDevUrlFrom prefers the Worker host and falls back to the custom domain", () => {
  const panel =
    "Deployed to https://other.account.workers.dev and https://fetchr-web.account.workers.dev"
  expect(workersDevUrlFrom(panel)).toBe("https://fetchr-web.account.workers.dev")
  expect(workersDevUrlFrom("no workers.dev url in this output")).toBe(
    "https://fetchr.hanyang.app",
  )
})

test("deploymentVersionFrom reads the serving version past the cf text header", () => {
  const output = `cf workers deployments list

List all deployments for a Worker.

{
  "deployments": [
    {
      "id": "deb4bfb8-1ced-4525-a7b0-c2c2709694ed",
      "versions": [
        { "version_id": "7d3feb00-ddf1-457f-a692-3526aa0629de", "percentage": 100 }
      ]
    }
  ]
}`
  expect(deploymentVersionFrom(output)).toBe("7d3feb00-ddf1-457f-a692-3526aa0629de")
  expect(deploymentVersionFrom("not json")).toBeUndefined()
  expect(deploymentVersionFrom('{"deployments": []}')).toBeUndefined()
})
