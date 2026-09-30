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

function watchHtml(view: unknown): string {
  const envelope = view as { readonly data?: unknown }
  if (envelope.data === null || envelope.data === undefined) {
    return "<html><title>missing</title></html>"
  }
  return `<html><script>window.__INITIAL_STATE__=${JSON.stringify({
    videoData: envelope.data,
  })};</script></html>`
}

function fixtureTransport(fixture: {
  readonly view: unknown
  readonly playurl: unknown
}): Transport {
  return {
    request(input) {
      const url = new URL(input.url)
      // The view API answers 412. The fixture only provides the watch page and playurl.
      if (url.pathname === "/x/web-interface/view") {
        return Effect.fail({
          code: "SOURCE_UNAVAILABLE",
          message: "view api must not be called",
        })
      }
      if (url.hostname === "b23.tv") {
        return Effect.succeed(
          new Response(null, {
            status: 302,
            headers: {
              location: `https://www.bilibili.com/video/${bvid}`,
            },
          }),
        )
      }
      if (url.pathname === "/x/player/playurl") {
        return Effect.succeed(
          new Response(JSON.stringify(fixture.playurl), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        )
      }
      return Effect.succeed(
        new Response(watchHtml(fixture.view), {
          status: 200,
          headers: { "content-type": "text/html" },
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

function rejectNetwork(): Promise<never> {
  return Promise.reject(new Error("bilibili tests must not use the network"))
}

beforeEach(() => {
  globalThis.fetch = rejectNetwork as unknown as typeof fetch
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
      video: {
        url: "https://cdn.example.test/anonymous/video.m4s",
        headers: { Referer: "https://www.bilibili.com/" },
      },
      audio: {
        url: "https://cdn.example.test/anonymous/audio.m4s",
        headers: { Referer: "https://www.bilibili.com/" },
      },
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
      headers: { Referer: "https://www.bilibili.com/" },
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

  test("a b23 short link resolves to the same video", async () => {
    const result = await Effect.runPromise(
      Effect.result(
        bilibiliExtractor.extract(
          {
            platform: "bilibili",
            url: new URL("https://b23.tv/abc123"),
          },
          fixtureTransport(separateFixture),
        ),
      ),
    )
    expect(Result.isSuccess(result)).toBe(true)
    if (Result.isFailure(result)) return
    expect(result.success.id).toBe(bvid)
    expect(result.success.canonicalUrl).toBe(
      "https://www.bilibili.com/video/BV1xx411c7mD",
    )
  })
})
