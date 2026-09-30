import { readFileSync } from "node:fs"

import type { CanonicalResource, ExtractFailure, MediaPost, Transport } from "@fetchr/core"
import { expect, test } from "bun:test"
import { Effect } from "effect"

import { resolveShortLink, xiaohongshuExtractor } from "./index"

const fixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8")

const shortLinkLocation = fixture("short-link-location.txt")
const shortLinkHtml = fixture("short-link.html")
const videoHtml = fixture("video-note.html")
const imageHtml = fixture("image-note.html")
const privateHtml = fixture("private-note.html")

const exploreUrl = "https://www.xiaohongshu.com/explore/abc123"

const videoPost: MediaPost = {
  platform: "xiaohongshu",
  id: "abc123",
  canonicalUrl: exploreUrl,
  author: { name: "fixture-video-author" },
  title: "fixture-video-title",
  description: "fixture-video-description",
  thumbnail: "https://cdn.fixture.example/video-cover.jpg",
  media: [
    {
      type: "video",
      id: "abc123-video",
      width: 720,
      height: 1280,
      thumbnail: "https://cdn.fixture.example/video-cover.jpg",
      delivery: {
        type: "proxy",
        token: "pending",
        upstreamUrl: "https://cdn.fixture.example/video.mp4",
        upstreamHeaders: { Referer: "https://www.xiaohongshu.com/" },
      },
    },
  ],
}

const imagePost: MediaPost = {
  platform: "xiaohongshu",
  id: "image123",
  canonicalUrl: "https://www.xiaohongshu.com/explore/image123",
  author: { name: "fixture-image-author" },
  title: "fixture-image-title",
  description: "fixture-image-description",
  thumbnail: "https://cdn.fixture.example/image-1.jpg",
  media: [
    {
      type: "image",
      id: "image123-image-1",
      width: 1080,
      height: 1440,
      delivery: { type: "direct", url: "https://cdn.fixture.example/image-1.jpg" },
    },
    {
      type: "image",
      id: "image123-image-2",
      width: 1080,
      height: 1440,
      delivery: {
        type: "proxy",
        token: "pending",
        upstreamUrl: "https://cdn.fixture.example/image-2.jpg",
        upstreamHeaders: { Referer: "https://www.xiaohongshu.com/" },
      },
    },
  ],
}

const resource = (url: string, id?: string): CanonicalResource => ({
  platform: "xiaohongshu",
  url: new URL(url),
  ...(id === undefined ? {} : { id }),
})

const htmlTransport = (pages: Readonly<Record<string, string>>): Transport => ({
  request: (input) => {
    const html = pages[input.url]
    if (html === undefined) {
      return Effect.fail({
        code: "SOURCE_UNAVAILABLE",
        message: `No fixture for ${input.url}`,
      })
    }
    return Effect.succeed(
      new Response(html, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    )
  },
})

const settle = (effect: Effect.Effect<MediaPost, ExtractFailure>) =>
  Effect.runPromise(
    Effect.match(effect, {
      onFailure: (error) => ({ ok: false as const, error }),
      onSuccess: (value) => ({ ok: true as const, value }),
    }),
  )

const assertNoPlatformWords = (post: MediaPost): void => {
  expect(JSON.stringify(post)).not.toMatch(/note|reel|short/i)
}

test("match accepts explore and short links and rejects other hosts", () => {
  expect(xiaohongshuExtractor.platform).toBe("xiaohongshu")
  expect(
    xiaohongshuExtractor.match(new URL("https://www.xiaohongshu.com/explore/abc123")),
  ).toBe(true)
  expect(xiaohongshuExtractor.match(new URL("https://xhslink.com/a/shortcode"))).toBe(true)
  expect(xiaohongshuExtractor.match(new URL("https://example.com/"))).toBe(false)
})

test("short-link fixtures resolve to the explore CanonicalResource", () => {
  for (const payload of [shortLinkLocation, shortLinkHtml]) {
    const resolved = resolveShortLink(payload)
    expect(resolved.platform).toBe("xiaohongshu")
    expect(resolved.id).toBe("abc123")
    expect(resolved.url.href).toBe(exploreUrl)
  }
})

test("a short link followed through the extractor becomes the video post", async () => {
  const seen: string[] = []
  const transport: Transport = {
    request: (input) => {
      seen.push(input.url)
      expect(input.headers.get("cookie")).toBeNull()
      if (input.url === "https://xhslink.com/a/shortcode") {
        return Effect.succeed(
          new Response(shortLinkHtml, {
            status: 302,
            headers: { location: shortLinkLocation.trim() },
          }),
        )
      }
      if (input.url === exploreUrl) {
        return Effect.succeed(new Response(videoHtml, { status: 200 }))
      }
      return Effect.fail({
        code: "SOURCE_UNAVAILABLE",
        message: `No fixture for ${input.url}`,
      })
    },
  }

  const result = await settle(
    xiaohongshuExtractor.extract(resource("https://xhslink.com/a/shortcode"), transport),
  )

  expect(seen).toEqual(["https://xhslink.com/a/shortcode", exploreUrl])
  expect(result.ok).toBe(true)
  if (result.ok) {
    expect(result.value).toEqual(videoPost)
    assertNoPlatformWords(result.value)
  }
})

test("video embedded state becomes one proxied video", async () => {
  const result = await settle(
    xiaohongshuExtractor.extract(
      resource(exploreUrl, "abc123"),
      htmlTransport({ [exploreUrl]: videoHtml }),
    ),
  )

  expect(result.ok).toBe(true)
  if (result.ok) {
    expect(result.value).toEqual(videoPost)
    expect(result.value.media).toHaveLength(1)
    expect(result.value.media[0]?.type).toBe("video")
    assertNoPlatformWords(result.value)
  }
})

test("image embedded state becomes two images with direct and proxy delivery", async () => {
  const url = "https://www.xiaohongshu.com/explore/image123"
  const result = await settle(
    xiaohongshuExtractor.extract(
      resource(url, "image123"),
      htmlTransport({ [url]: imageHtml }),
    ),
  )

  expect(result.ok).toBe(true)
  if (result.ok) {
    expect(result.value).toEqual(imagePost)
    expect(result.value.media.map((asset) => asset.type)).toEqual(["image", "image"])
    expect(JSON.stringify(result.value)).toContain("image-1.jpg")
    assertNoPlatformWords(result.value)
  }
})

test("private embedded state returns PRIVATE_MEDIA", async () => {
  const url = "https://www.xiaohongshu.com/explore/private123"
  const result = await settle(
    xiaohongshuExtractor.extract(
      resource(url, "private123"),
      htmlTransport({ [url]: privateHtml }),
    ),
  )

  expect(result.ok).toBe(false)
  if (!result.ok) {
    expect(result.error.code).toBe("PRIVATE_MEDIA")
  }
})

test("fixtures are anonymous and extraction does not call the network", async () => {
  for (const contents of [shortLinkLocation, shortLinkHtml, videoHtml, imageHtml, privateHtml]) {
    expect(contents.toLowerCase()).not.toContain("cookie")
    expect(contents).not.toMatch(/\b\d{16,}\b/)
  }

  const calls: Array<string> = []
  const original = globalThis.fetch
  globalThis.fetch = Object.assign(
    (input: string | URL | Request): Promise<Response> => {
      calls.push(String(input))
      return Promise.reject(new Error("network disabled"))
    },
    { preconnect: original.preconnect },
  )

  try {
    const video = await settle(
      xiaohongshuExtractor.extract(
        resource(exploreUrl, "abc123"),
        htmlTransport({ [exploreUrl]: videoHtml }),
      ),
    )
    const imageUrl = "https://www.xiaohongshu.com/explore/image123"
    const image = await settle(
      xiaohongshuExtractor.extract(
        resource(imageUrl, "image123"),
        htmlTransport({ [imageUrl]: imageHtml }),
      ),
    )
    expect(video.ok).toBe(true)
    expect(image.ok).toBe(true)
    expect(calls).toEqual([])
  } finally {
    globalThis.fetch = original
  }
})
