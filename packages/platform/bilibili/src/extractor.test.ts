import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { CanonicalResource, Transport } from "@fetchr/core"
import { Effect, Result } from "effect"
import { bilibiliExtractor } from "@fetchr/platform-bilibili"
import dashFixture from "../fixtures/dash.json" with { type: "json" }
import notFoundFixture from "../fixtures/not-found.json" with { type: "json" }
import progressiveFixture from "../fixtures/video-progressive.json" with { type: "json" }
import separateFixture from "../fixtures/video-separate.json" with { type: "json" }

const bvid = "BV1xx411c7mD"

const resource: CanonicalResource = {
  platform: "bilibili",
  id: bvid,
  url: new URL(`https://www.bilibili.com/video/${bvid}`),
}

function fixtureTransport(fixture: {
  readonly view: unknown
  readonly playurl: unknown
}): Transport {
  return {
    request(input) {
      const url = new URL(input.url)
      const body =
        url.pathname === "/x/web-interface/view" ? fixture.view : fixture.playurl
      return Effect.succeed(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
    },
  }
}

async function extract(fixture: {
  readonly view: unknown
  readonly playurl: unknown
}) {
  return Effect.runPromise(
    Effect.result(bilibiliExtractor.extract(resource, fixtureTransport(fixture))),
  )
}

const originalFetch = globalThis.fetch

beforeEach(() => {
  const blocked = () =>
    Promise.reject(new Error("bilibili tests must not use the network"))
  globalThis.fetch = blocked as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("bilibiliExtractor.match", () => {
  test("accepts a bilibili video url", () => {
    expect(
      bilibiliExtractor.match(
        new URL("https://www.bilibili.com/video/BV1xx411c7mD"),
      ),
    ).toBe(true)
  })

  test("accepts a b23 short url", () => {
    expect(bilibiliExtractor.match(new URL("https://b23.tv/abc123"))).toBe(true)
  })

  test("rejects an unrelated url", () => {
    expect(bilibiliExtractor.match(new URL("https://example.com/"))).toBe(false)
    expect(bilibiliExtractor.match(new URL("https://www.bilibili.com/"))).toBe(
      false,
    )
    expect(
      bilibiliExtractor.match(
        new URL("http://www.bilibili.com/video/BV1xx411c7mD"),
      ),
    ).toBe(false)
  })
})

describe("bilibiliExtractor.extract", () => {
  test("separate video and audio urls become one mux delivery", async () => {
    const result = await extract(separateFixture)
    expect(Result.isSuccess(result)).toBe(true)
    if (Result.isFailure(result)) return

    const post = result.success
    expect(post.platform).toBe("bilibili")
    expect(post.id).toBe(bvid)
    expect(post.canonicalUrl).toBe(
      "https://www.bilibili.com/video/BV1xx411c7mD",
    )
    expect(post.title).toBe("anonymous separate streams")
    expect(post.media).toHaveLength(1)
    const asset = post.media[0]
    expect(asset?.type).toBe("video")
    if (asset?.type !== "video") return
    expect(asset.delivery).toEqual({
      type: "mux",
      outputContainer: "mp4",
      video: { url: "https://cdn.example.test/anonymous/video.m4s" },
      audio: { url: "https://cdn.example.test/anonymous/audio.m4s" },
    })
  })

  test("one progressive file becomes a direct delivery", async () => {
    const result = await extract(progressiveFixture)
    expect(Result.isSuccess(result)).toBe(true)
    if (Result.isFailure(result)) return

    const asset = result.success.media[0]
    expect(asset?.type).toBe("video")
    if (asset?.type !== "video") return
    expect(asset.delivery).toEqual({
      type: "direct",
      url: "https://cdn.example.test/anonymous/progressive.mp4",
    })
  })

  test("a dash manifest becomes a playlist delivery", async () => {
    const result = await extract(dashFixture)
    expect(Result.isSuccess(result)).toBe(true)
    if (Result.isFailure(result)) return

    const asset = result.success.media[0]
    expect(asset?.type).toBe("video")
    if (asset?.type !== "video") return
    expect(asset.delivery).toEqual({
      type: "playlist",
      protocol: "dash",
      url: "https://cdn.example.test/anonymous/index.mpd",
    })
  })

  test("a missing video returns MEDIA_NOT_FOUND", async () => {
    const result = await extract(notFoundFixture)
    expect(Result.isFailure(result)).toBe(true)
    if (Result.isSuccess(result)) return
    expect(result.failure.code).toBe("MEDIA_NOT_FOUND")
  })
})
