import { readFileSync } from "node:fs"

import type { CanonicalResource, ExtractFailure, MediaPost, Transport } from "@fetchr/core"
import { expect, test } from "bun:test"
import { Effect } from "effect"

import {
  createXiaohongshuExtractor,
  resolveShortLink,
  sessionFromCookieHeader,
  xiaohongshuExtractor,
} from "./index"

const fixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8")

const shortLinkLocation = fixture("short-link-location.txt")
const shortLinkHtml = fixture("short-link.html")
const videoHtml = fixture("video-note.html")
const imageHtml = fixture("image-note.html")
const privateHtml = fixture("private-note.html")

const resolvedPageUrl =
  "https://www.xiaohongshu.com/discovery/item/abc123?xsec_token=fixture-token&xsec_source=app_share&type=video&author_share=1"

const videoPost: MediaPost = {
  platform: "xiaohongshu",
  id: "abc123",
  canonicalUrl: "https://www.xiaohongshu.com/explore/abc123",
  author: {
    name: "fixture-video-author",
    avatar: "https://cdn.fixture.example/avatar.jpg",
    profileUrl: "https://www.xiaohongshu.com/user/profile/fixture-user-id",
  },
  title: "fixture-video-title",
  description: "fixture-video-description",
  media: [
    {
      type: "video",
      id: "abc123-video",
      width: 1080,
      height: 2400,
      delivery: {
        type: "proxy",
        token: "pending",
        upstreamUrl: "https://sns-video-bd.xhscdn.com/pre_post/fixture-origin-key",
      },
    },
    {
      type: "video",
      id: "abc123-video:720p",
      width: 720,
      height: 1280,
      codec: "h265",
      container: "mp4",
      bytes: 849017,
      delivery: {
        type: "proxy",
        token: "pending",
        upstreamUrl: "https://cdn.fixture.example/video-hevc.mp4?sign=fixture",
      },
    },
    {
      type: "video",
      id: "abc123-video:browser",
      width: 720,
      height: 1280,
      codec: "h264",
      container: "mp4",
      delivery: {
        type: "proxy",
        token: "pending",
        upstreamUrl: "https://cdn.fixture.example/video.mp4?sign=fixture",
      },
    },
  ],
}

const imagePost: MediaPost = {
  platform: "xiaohongshu",
  id: "image123",
  canonicalUrl: "https://www.xiaohongshu.com/explore/image123",
  author: {
    name: "fixture-image-author",
    avatar: "https://cdn.fixture.example/avatar-image.jpg",
    profileUrl: "https://www.xiaohongshu.com/user/profile/fixture-image-user-id",
  },
  title: "fixture-image-title",
  description: "fixture-image-description",
  media: [
    {
      type: "image",
      id: "image123-image-1",
      width: 1080,
      height: 1440,
      delivery: {
        type: "proxy",
        token: "pending",
        upstreamUrl: "https://sns-img-bd.xhscdn.com/spectrum/fixture-image-1",
      },
    },
    {
      type: "image",
      id: "image123-image-2",
      width: 1080,
      height: 1440,
      delivery: {
        type: "proxy",
        token: "pending",
        upstreamUrl: "https://cdn.fixture.example/image-2.jpg!h5_1080jpg",
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

test("match accepts explore, discovery, search_result and short links", () => {
  expect(xiaohongshuExtractor.platform).toBe("xiaohongshu")
  for (const url of [
    "https://www.xiaohongshu.com/explore/abc123",
    "https://www.xiaohongshu.com/explore/abc123?xsec_token=t",
    "https://www.xiaohongshu.com/discovery/item/abc123?xsec_token=t",
    "https://www.xiaohongshu.com/search_result/abc123?xsec_token=t",
    "https://xhslink.com/a/shortcode",
    "https://xhslink.com/o/shortcode",
    "https://xhslink.cn/o/shortcode",
    "http://xhslink.cn/o/shortcode",
  ]) {
    expect(xiaohongshuExtractor.match(new URL(url))).toBe(true)
  }
  expect(xiaohongshuExtractor.match(new URL("https://www.xiaohongshu.com/"))).toBe(false)
  expect(xiaohongshuExtractor.match(new URL("https://example.com/"))).toBe(false)
})

test("short-link payloads resolve to the full note URL with xsec_token intact", () => {
  for (const payload of [shortLinkLocation, shortLinkHtml]) {
    const resolved = resolveShortLink(payload)
    expect(resolved.platform).toBe("xiaohongshu")
    expect(resolved.id).toBe("abc123")
    expect(resolved.url.href).toBe(resolvedPageUrl)
    expect(resolved.url.searchParams.get("xsec_token")).toBe("fixture-token")
  }
})

test("a short link followed through the extractor fetches the token URL", async () => {
  const seen: string[] = []
  const transport: Transport = {
    request: (input) => {
      seen.push(input.url)
      if (input.url === "https://xhslink.com/a/shortcode") {
        return Effect.succeed(
          new Response(shortLinkHtml, {
            status: 302,
            headers: { location: shortLinkLocation.trim() },
          }),
        )
      }
      if (input.url === resolvedPageUrl) {
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

  expect(seen).toEqual(["https://xhslink.com/a/shortcode", resolvedPageUrl])
  expect(result.ok).toBe(true)
  if (result.ok) {
    expect(result.value).toEqual(videoPost)
    assertNoPlatformWords(result.value)
  }
})

test("video embedded state becomes one proxied video from the original upload", async () => {
  const result = await settle(
    xiaohongshuExtractor.extract(
      resource(resolvedPageUrl, "abc123"),
      htmlTransport({ [resolvedPageUrl]: videoHtml }),
    ),
  )

  expect(result.ok).toBe(true)
  if (result.ok) {
    expect(result.value).toEqual(videoPost)
    expect(result.value.media).toHaveLength(3)
    expect(result.value.media[0]?.type).toBe("video")
    assertNoPlatformWords(result.value)
  }
})

test("a note without an origin key falls back to the muxed h264 stream", async () => {
  const result = await settle(
    xiaohongshuExtractor.extract(
      resource(resolvedPageUrl, "abc123"),
      htmlTransport({
        [resolvedPageUrl]: videoHtml.replaceAll("originVideoKey", "missingKey"),
      }),
    ),
  )

  expect(result.ok).toBe(true)
  if (result.ok) {
    const video = result.value.media[0]
    expect(video?.type).toBe("video")
    if (video?.type === "video") {
      expect(video.delivery).toEqual({
        type: "proxy",
        token: "pending",
        upstreamUrl: "https://cdn.fixture.example/video.mp4?sign=fixture",
      })
      expect(video.codec).toBe("h264")
    }
  }
})

test("image embedded state becomes proxied images from url and infoList", async () => {
  const url = "https://www.xiaohongshu.com/discovery/item/image123?xsec_token=t"
  const result = await settle(
    xiaohongshuExtractor.extract(
      resource("https://www.xiaohongshu.com/explore/image123?xsec_token=t", "image123"),
      htmlTransport({ [url]: imageHtml }),
    ),
  )

  expect(result.ok).toBe(true)
  if (result.ok) {
    expect(result.value).toEqual(imagePost)
    expect(result.value.media.map((asset) => asset.type)).toEqual(["image", "image"])
    assertNoPlatformWords(result.value)
  }
})

test("private embedded state returns PRIVATE_MEDIA via the desktop fallback", async () => {
  const url = "https://www.xiaohongshu.com/discovery/item/private123?xsec_token=t"
  const result = await settle(
    xiaohongshuExtractor.extract(
      resource("https://www.xiaohongshu.com/explore/private123?xsec_token=t", "private123"),
      htmlTransport({ [url]: privateHtml }),
    ),
  )

  expect(result.ok).toBe(false)
  if (!result.ok) {
    expect(result.error.code).toBe("PRIVATE_MEDIA")
  }
})

test("a session sends its cookie header on page requests", async () => {
  const extractor = createXiaohongshuExtractor(
    sessionFromCookieHeader("a1=fixture-a1; web_session=fixture-session"),
  )
  const seenCookies: Array<string | null> = []
  const transport: Transport = {
    request: (input) => {
      seenCookies.push(input.headers.get("cookie"))
      return Effect.succeed(new Response(imageHtml, { status: 200 }))
    },
  }
  const result = await settle(
    extractor.extract(
      resource("https://www.xiaohongshu.com/explore/image123?xsec_token=t", "image123"),
      transport,
    ),
  )

  expect(result.ok).toBe(true)
  expect(seenCookies).toEqual(["a1=fixture-a1; web_session=fixture-session"])
})

test("anonymous requests bounce off the security redirect as LOGIN_REQUIRED", async () => {
  const transport: Transport = {
    request: () =>
      Effect.succeed(
        new Response("", {
          status: 302,
          headers: {
            location:
              "https://www.xiaohongshu.com/404/sec_abc?error_code=300031",
          },
        }),
      ),
  }
  const result = await settle(
    xiaohongshuExtractor.extract(
      resource("https://www.xiaohongshu.com/explore/abc123"),
      transport,
    ),
  )
  expect(result.ok).toBe(false)
  if (!result.ok) {
    expect(result.error.code).toBe("LOGIN_REQUIRED")
    expect(result.error.cause).toBe("300031")
  }
})

test("a signed-in session reports the security gate as MEDIA_NOT_FOUND", async () => {
  const extractor = createXiaohongshuExtractor(
    sessionFromCookieHeader("web_session=fixture-session"),
  )
  const transport: Transport = {
    request: () =>
      Effect.succeed(
        new Response("", {
          status: 302,
          headers: {
            location:
              "https://www.xiaohongshu.com/404/sec_abc?error_code=300031",
          },
        }),
      ),
  }
  const result = await settle(
    extractor.extract(
      resource("https://www.xiaohongshu.com/explore/abc123"),
      transport,
    ),
  )
  expect(result.ok).toBe(false)
  if (!result.ok) {
    expect(result.error.code).toBe("MEDIA_NOT_FOUND")
    expect(result.error.cause).toBe("300031")
  }
})

test("a WAF throttle redirect reports RATE_LIMITED regardless of session", async () => {
  const location =
    "https://www.xiaohongshu.com/404/sec_abc?source=xhs_sec_server&originalUrl=https%3A%2F%2Fwww.xiaohongshu.com%2Fdiscovery%2Fitem%2Fabc123"
  const transport: Transport = {
    request: () =>
      Effect.succeed(new Response("", { status: 302, headers: { location } })),
  }
  const anon = await settle(
    xiaohongshuExtractor.extract(
      resource("https://www.xiaohongshu.com/explore/abc123?xsec_token=t"),
      transport,
    ),
  )
  const authed = await settle(
    createXiaohongshuExtractor(
      sessionFromCookieHeader("web_session=fixture-session"),
    ).extract(resource("https://www.xiaohongshu.com/explore/abc123?xsec_token=t"), transport),
  )
  expect(anon.ok).toBe(false)
  expect(authed.ok).toBe(false)
  if (!anon.ok) expect(anon.error.code).toBe("RATE_LIMITED")
  if (!authed.ok) expect(authed.error.code).toBe("RATE_LIMITED")
})

test("a throttled page request retries once and can still succeed", async () => {
  const location =
    "https://www.xiaohongshu.com/404/sec_abc?source=xhs_sec_server&originalUrl=x"
  const responses = [
    new Response("", { status: 302, headers: { location } }),
    new Response(imageHtml, { status: 200 }),
  ]
  let calls = 0
  const transport: Transport = {
    request: () => Effect.succeed(responses[Math.min(calls++, 1)] as Response),
  }
  const result = await settle(
    xiaohongshuExtractor.extract(
      resource("https://www.xiaohongshu.com/explore/image123?xsec_token=t"),
      transport,
    ),
  )
  expect(calls).toBe(2)
  expect(result.ok).toBe(true)
  if (result.ok) expect(result.value.media[0]?.type).toBe("image")
})

test("a link without xsec_token reports LOGIN_REQUIRED without retrying", async () => {
  const location =
    "https://www.xiaohongshu.com/404/sec_abc?source=xhs_sec_server&originalUrl=x"
  let calls = 0
  const transport: Transport = {
    request: () =>
      Effect.sync(() => {
        calls += 1
        return new Response("", { status: 302, headers: { location } })
      }),
  }
  const result = await settle(
    xiaohongshuExtractor.extract(
      resource("https://www.xiaohongshu.com/explore/abc123"),
      transport,
    ),
  )
  expect(calls).toBe(1)
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.error.code).toBe("LOGIN_REQUIRED")
})

test("a persistent throttle still reports RATE_LIMITED after the retry", async () => {
  const location =
    "https://www.xiaohongshu.com/404/sec_abc?source=xhs_sec_server&originalUrl=x"
  let calls = 0
  const transport: Transport = {
    request: () =>
      Effect.sync(() => {
        calls += 1
        return new Response("", { status: 302, headers: { location } })
      }),
  }
  const result = await settle(
    xiaohongshuExtractor.extract(
      resource("https://www.xiaohongshu.com/explore/image123?xsec_token=t"),
      transport,
    ),
  )
  expect(calls).toBe(2)
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.error.code).toBe("RATE_LIMITED")
})

test("a 200 page without note state reports the note as unavailable", async () => {
  const gateHtml = "<html><body>登录后推荐更懂你的笔记</body></html>"
  const result = await settle(
    xiaohongshuExtractor.extract(
      resource("https://www.xiaohongshu.com/explore/abc123"),
      htmlTransport({
        "https://www.xiaohongshu.com/discovery/item/abc123": gateHtml,
      }),
    ),
  )
  expect(result.ok).toBe(false)
  if (!result.ok) {
    expect(result.error.code).toBe("MEDIA_NOT_FOUND")
    expect(result.error.cause).toBe("no-token")
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
      calls.push(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      )
      return Promise.reject(new Error("network disabled"))
    },
    { preconnect: original.preconnect },
  )

  try {
    const video = await settle(
      xiaohongshuExtractor.extract(
        resource(resolvedPageUrl, "abc123"),
        htmlTransport({ [resolvedPageUrl]: videoHtml }),
      ),
    )
    const imagePageUrl = "https://www.xiaohongshu.com/discovery/item/image123?xsec_token=t"
    const image = await settle(
      xiaohongshuExtractor.extract(
        resource("https://www.xiaohongshu.com/explore/image123?xsec_token=t", "image123"),
        htmlTransport({ [imagePageUrl]: imageHtml }),
      ),
    )
    expect(video.ok).toBe(true)
    expect(image.ok).toBe(true)
    expect(calls).toEqual([])
  } finally {
    globalThis.fetch = original
  }
})
