import { describe, expect, test } from "bun:test"
import type { MediaPost } from "@fetchr/core"
import {
  deliveryKinds,
  readMetadata,
  rememberMetadata,
  resetGuards,
  safeLog,
  takePermit,
} from "./guard"

const post: MediaPost = {
  platform: "fixture",
  id: "demo",
  canonicalUrl: "https://fixture.test/video/demo",
  title: "演示视频",
  media: [
    {
      type: "video",
      id: "demo",
      delivery: {
        type: "proxy",
        token: "signed",
        upstreamUrl: "https://cdn.example/secret.mp4",
      },
    },
  ],
}

describe("guards", () => {
  test("extract is limited sooner than download", () => {
    resetGuards()
    for (let index = 0; index < 10; index += 1) {
      expect(takePermit("1.1.1.1", "extract", 1_000).ok).toBe(true)
    }
    expect(takePermit("1.1.1.1", "extract", 1_000)).toEqual({
      ok: false,
      challenge: true,
    })
    expect(takePermit("1.1.1.1", "download", 1_000).ok).toBe(true)
  })

  test("metadata cache drops delivery urls and media bytes", () => {
    resetGuards()
    rememberMetadata(post, 0)
    const stored = readMetadata("fixture", "demo", 1_000)
    expect(stored?.title).toBe("演示视频")
    const encoded = JSON.stringify(stored)
    expect(encoded).not.toContain("secret.mp4")
    expect(encoded).not.toContain("signed")
    expect(readMetadata("fixture", "demo", 11 * 60_000)).toBeUndefined()
  })

  test("log line omits cookies, authorization, signed urls, and the input url", () => {
    const line = safeLog({
      platform: "youtube",
      ok: false,
      error: "LOGIN_REQUIRED",
      latencyMs: 12,
      delivery: deliveryKinds(post),
    })
    expect(line).toContain("youtube")
    expect(line).toContain("LOGIN_REQUIRED")
    expect(line).toContain("proxy")
    expect(line).not.toContain("cookie")
    expect(line).not.toContain("authorization")
    expect(line).not.toContain("http")
  })
})
