import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { CanonicalResource, ExtractFailure, Transport } from "@fetchr/core"
import { Cause, Effect, Exit, Option } from "effect"
import { imagePostFixture } from "./fixtures/image-post"
import { privateFixture } from "./fixtures/private"
import { videoFixture } from "./fixtures/video"
import { douyinExtractor } from "./index"

const videoId = "7000000000000000001"
const imageId = "7000000000000000002"
const privateId = "7000000000000000003"

const videoPost = {
  platform: "douyin",
  id: videoId,
  canonicalUrl: `https://www.douyin.com/video/${videoId}`,
  author: {
    id: "fixture-author-1",
    name: "fixture-author",
    username: "fixture_author",
    avatar: "https://cdn.example/avatars/fixture-author.jpg",
  },
  description: "public fixture clip",
  thumbnail: "https://cdn.example/covers/clip.jpg",
  media: [
    {
      type: "video",
      id: videoId,
      width: 720,
      height: 1280,
      thumbnail: "https://cdn.example/covers/clip.jpg",
      delivery: {
        type: "proxy",
        token: "pending",
        upstreamUrl: "https://cdn.example/media/clip.mp4",
        upstreamHeaders: { Referer: "https://www.douyin.com/" },
      },
    },
  ],
} as const

const originalFetch = globalThis.fetch

beforeEach(() => {
  globalThis.fetch = (() => {
    throw new Error("douyin extractor must not call fetch")
  }) as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

function resource(url: string, id?: string): CanonicalResource {
  if (id === undefined) {
    return { platform: "douyin", url: new URL(url) }
  }
  return { platform: "douyin", id, url: new URL(url) }
}

function fixtureTransport(
  fixtures: Readonly<Record<string, unknown>>,
): Transport {
  return {
    request(input) {
      const url = new URL(input.url)
      if (url.hostname === "v.douyin.com") {
        return Effect.succeed(
          new Response(null, {
            status: 302,
            headers: {
              location: `https://www.douyin.com/video/${videoId}`,
            },
          }),
        )
      }
      const id = url.searchParams.get("aweme_id")
      const payload = id === null ? undefined : fixtures[id]
      if (payload === undefined) {
        const missing: ExtractFailure = {
          code: "MEDIA_NOT_FOUND",
          message: "fixture transport has no payload",
        }
        return Effect.fail(missing)
      }
      return Effect.succeed(Response.json(payload))
    },
  }
}

async function failureOf(
  effect: Effect.Effect<unknown, ExtractFailure>,
): Promise<ExtractFailure> {
  const exit = await Effect.runPromiseExit(effect)
  if (!Exit.isFailure(exit)) {
    throw new Error("expected extract to fail")
  }
  const error = Cause.findErrorOption(exit.cause)
  if (!Option.isSome(error)) {
    throw new Error("expected a typed extract failure")
  }
  return error.value
}

describe("douyin extractor", () => {
  test("matches a douyin short link", () => {
    expect(douyinExtractor.match(new URL("https://v.douyin.com/abc123/"))).toBe(
      true,
    )
  })

  test("matches an iesdouyin share video url", () => {
    expect(
      douyinExtractor.match(
        new URL("https://www.iesdouyin.com/share/video/7000000000000000001/"),
      ),
    ).toBe(true)
  })

  test("matches a douyin video url", () => {
    expect(
      douyinExtractor.match(
        new URL("https://www.douyin.com/video/7000000000000000001"),
      ),
    ).toBe(true)
  })

  test("rejects a tiktok url", () => {
    expect(
      douyinExtractor.match(new URL("https://www.tiktok.com/@a/video/1")),
    ).toBe(false)
  })

  test("rejects an unrelated url", () => {
    expect(douyinExtractor.match(new URL("https://example.com/"))).toBe(false)
  })

  test("asks the public feed and ignores a login cookie", async () => {
    const previous = process.env.DOUYIN_COOKIE
    process.env.DOUYIN_COOKIE = "sessionid=local-login"
    const seen: Request[] = []
    const transport: Transport = {
      request(input) {
        seen.push(input)
        return Effect.succeed(Response.json(videoFixture))
      },
    }
    try {
      await Effect.runPromise(
        douyinExtractor.extract(
          resource(`https://www.douyin.com/video/${videoId}`, videoId),
          transport,
        ),
      )
    } finally {
      if (previous === undefined) delete process.env.DOUYIN_COOKIE
      else process.env.DOUYIN_COOKIE = previous
    }
    expect(seen).toHaveLength(1)
    const detail = seen[0]
    if (detail === undefined) return
    const url = new URL(detail.url)
    expect(url.hostname).toBe("api5-normal-c-hl.amemv.com")
    expect(url.pathname).toBe("/aweme/v1/feed/")
    expect(url.searchParams.get("aweme_id")).toBe(videoId)
    expect(url.searchParams.get("aid")).toBe("1128")
    expect(url.searchParams.has("a_bogus")).toBe(false)
    expect(url.searchParams.has("fetchr_sign")).toBe(false)
    expect(detail.headers.get("cookie")).toBeNull()
    expect(detail.headers.get("user-agent")).toContain("aweme")
  })

  test("uses the backup feed when the first host is rejected", async () => {
    const seen: Request[] = []
    const transport: Transport = {
      request(input) {
        seen.push(input)
        if (seen.length === 1) {
          return Effect.succeed(new Response(null, { status: 403 }))
        }
        return Effect.succeed(Response.json(videoFixture))
      },
    }
    const post = await Effect.runPromise(
      douyinExtractor.extract(
        resource(`https://www.douyin.com/video/${videoId}`, videoId),
        transport,
      ),
    )
    expect(post.id).toBe(videoId)
    expect(seen).toHaveLength(2)
    expect(new URL(seen[1]?.url ?? "").hostname).toBe("aweme.snssdk.com")
  })

  test("uses the original play endpoint when the feed includes a video id", async () => {
    const videoIdForFile = "v0200fixturevideo0000000000000001"
    const detail = {
      ...videoFixture.aweme_detail,
      video: {
        ...videoFixture.aweme_detail.video,
        play_addr: {
          uri: videoIdForFile,
          url_list: [...videoFixture.aweme_detail.video.play_addr.url_list],
        },
      },
    }
    const post = await Effect.runPromise(
      douyinExtractor.extract(
        resource(`https://www.douyin.com/video/${videoId}`, videoId),
        fixtureTransport({
          [videoId]: { status_code: 0, aweme_detail: detail },
        }),
      ),
    )
    expect(post.media).toHaveLength(2)
    const original = post.media[0]?.delivery
    const fallback = post.media[1]?.delivery
    expect(post.media[1]?.id).toBe(`${videoId}:browser`)
    expect(original?.type).toBe("proxy")
    expect(fallback?.type).toBe("proxy")
    if (original?.type !== "proxy" || fallback?.type !== "proxy") return
    expect(original.upstreamUrl).toBe(
      `https://aweme.snssdk.com/aweme/v1/play/?video_id=${videoIdForFile}&ratio=default&line=0`,
    )
    expect(fallback.upstreamUrl).toBe(
      `https://aweme.snssdk.com/aweme/v1/play/?video_id=${videoIdForFile}&ratio=1080p&line=0`,
    )
    expect(original.upstreamUrl).not.toContain("playwm")
    expect(fallback.upstreamUrl).not.toContain("playwm")
  })

  test("picks the requested video out of a public feed", async () => {
    const feed = {
      status_code: 0,
      aweme_list: [{ aweme_id: "other" }, videoFixture.aweme_detail],
    }
    const post = await Effect.runPromise(
      douyinExtractor.extract(
        resource(`https://www.douyin.com/video/${videoId}`, videoId),
        fixtureTransport({ [videoId]: feed }),
      ),
    )
    expect(post).toEqual(videoPost)
  })

  test("fails when the feed does not include this video", async () => {
    const transport: Transport = {
      request() {
        return Effect.succeed(Response.json({ status_code: 0, aweme_list: [] }))
      },
    }
    const failure = await failureOf(
      douyinExtractor.extract(
        resource(`https://www.douyin.com/video/${videoId}`, videoId),
        transport,
      ),
    )
    expect(failure.code).toBe("SOURCE_UNAVAILABLE")
  })

  test("normalizes a video fixture into a MediaPost", async () => {
    const post = await Effect.runPromise(
      douyinExtractor.extract(
        resource(`https://www.douyin.com/video/${videoId}`, videoId),
        fixtureTransport({ [videoId]: videoFixture }),
      ),
    )
    expect(post).toEqual(videoPost)
  })

  test("reads the video id from an iesdouyin share redirect", async () => {
    const seen: string[] = []
    const transport: Transport = {
      request(input) {
        seen.push(input.url)
        const url = new URL(input.url)
        if (url.hostname === "v.douyin.com") {
          return Effect.succeed(
            new Response(null, {
              status: 302,
              headers: {
                location: `https://www.iesdouyin.com/share/video/${videoId}/`,
              },
            }),
          )
        }
        return Effect.succeed(Response.json(videoFixture))
      },
    }
    const post = await Effect.runPromise(
      douyinExtractor.extract(resource("https://v.douyin.com/abc123/"), transport),
    )
    expect(post.id).toBe(videoId)
    expect(seen.some((item) => item.includes("iesdouyin"))).toBe(false)
  })

  test("resolves a short link fixture into the same video MediaPost", async () => {
    const post = await Effect.runPromise(
      douyinExtractor.extract(
        resource("https://v.douyin.com/abc123/"),
        fixtureTransport({ [videoId]: videoFixture }),
      ),
    )
    expect(post).toEqual(videoPost)
  })

  test("normalizes an image post fixture into image media", async () => {
    const post = await Effect.runPromise(
      douyinExtractor.extract(
        resource(`https://www.douyin.com/video/${imageId}`, imageId),
        fixtureTransport({ [imageId]: imagePostFixture }),
      ),
    )
    expect(post.platform).toBe("douyin")
    expect(post.id).toBe(imageId)
    expect(post.media.map((asset) => asset.type)).toEqual(["image", "image"])
    expect(post.media[0]?.delivery).toEqual({
      type: "direct",
      url: "https://cdn.example/images/one.jpg",
    })
    expect(post.media[1]?.delivery).toEqual({
      type: "direct",
      url: "https://cdn.example/images/two.jpg",
    })
  })

  test("returns PRIVATE_MEDIA for a private fixture", async () => {
    const failure = await failureOf(
      douyinExtractor.extract(
        resource(`https://www.douyin.com/video/${privateId}`, privateId),
        fixtureTransport({ [privateId]: privateFixture }),
      ),
    )
    expect(failure.code).toBe("PRIVATE_MEDIA")
  })

  test("matches a slides share url and a note url", () => {
    expect(
      douyinExtractor.match(
        new URL(`https://www.iesdouyin.com/share/slides/${imageId}/`),
      ),
    ).toBe(true)
    expect(
      douyinExtractor.match(new URL(`https://www.douyin.com/note/${imageId}`)),
    ).toBe(true)
    expect(
      douyinExtractor.match(
        new URL(`https://www.iesdouyin.com/share/note/${imageId}/`),
      ),
    ).toBe(true)
  })

  test("reads a note from slidesinfo without fetching the share page", async () => {
    const seen: Request[] = []
    const transport: Transport = {
      request(input) {
        seen.push(input)
        const url = new URL(input.url)
        if (url.hostname === "v.douyin.com") {
          return Effect.succeed(
            new Response(null, {
              status: 302,
              headers: {
                location: `https://www.iesdouyin.com/share/slides/${imageId}/`,
              },
            }),
          )
        }
        return Effect.succeed(
          Response.json({
            status_code: 0,
            aweme_details: [{ aweme_id: "other" }, imagePostFixture.aweme_detail],
          }),
        )
      },
    }
    const post = await Effect.runPromise(
      douyinExtractor.extract(resource("https://v.douyin.com/noteCode/"), transport),
    )
    expect(post.id).toBe(imageId)
    expect(post.canonicalUrl).toBe(`https://www.douyin.com/note/${imageId}`)
    expect(post.media.map((asset) => asset.type)).toEqual(["image", "image"])
    expect(post.media[0]?.delivery).toEqual({
      type: "direct",
      url: "https://cdn.example/images/one.jpg",
    })
    expect(post.media[1]?.delivery).toEqual({
      type: "direct",
      url: "https://cdn.example/images/two.jpg",
    })
    const slides = seen.find((item) => item.url.includes("slidesinfo"))
    expect(slides).toBeDefined()
    if (slides === undefined) return
    const slidesUrl = new URL(slides.url)
    expect(slidesUrl.searchParams.get("aweme_ids")).toBe(`[${imageId}]`)
    expect(slidesUrl.searchParams.get("request_source")).toBe("200")
    expect(slidesUrl.searchParams.has("a_bogus")).toBe(false)
    expect(slides.headers.get("cookie")).toBeNull()
    expect(slides.headers.get("user-agent")).toBeNull()
    expect(seen.some((item) => item.url.includes("/share/slides"))).toBe(false)
    expect(seen.some((item) => item.url.includes("/aweme/v1/feed/"))).toBe(false)
  })

  test("uses the jpeg and proxies douyin image hosts", async () => {
    const post = await Effect.runPromise(
      douyinExtractor.extract(
        resource(`https://www.douyin.com/note/${imageId}`),
        {
          request() {
            return Effect.succeed(
              Response.json({
                status_code: 0,
                aweme_details: [
                  {
                    aweme_id: imageId,
                    desc: "signed images",
                    private_status: null,
                    images: [
                      {
                        url_list: [
                          "https://p3-sign.douyinpic.com/tos/preview.webp",
                          "https://p3-sign.douyinpic.com/tos/original.jpeg",
                        ],
                        download_url_list: [
                          "https://p3-sign.douyinpic.com/tos/watermark.jpeg",
                        ],
                        width: 1280,
                        height: 854,
                      },
                    ],
                  },
                ],
              }),
            )
          },
        },
      ),
    )
    expect(post.thumbnail).toBeUndefined()
    expect(post.media).toHaveLength(1)
    const delivery = post.media[0]?.delivery
    expect(delivery?.type).toBe("proxy")
    if (delivery?.type !== "proxy") return
    expect(delivery.upstreamUrl).toBe(
      "https://p3-sign.douyinpic.com/tos/original.jpeg",
    )
    expect(delivery.upstreamHeaders).toEqual({ Referer: "https://www.douyin.com/" })
  })

  test("retries slidesinfo with the app user agent when the first list is empty", async () => {
    const seen: Request[] = []
    const transport: Transport = {
      request(input) {
        seen.push(input)
        if (seen.length === 1) {
          return Effect.succeed(Response.json({ status_code: 0, aweme_details: [] }))
        }
        return Effect.succeed(
          Response.json({
            status_code: 0,
            aweme_details: [imagePostFixture.aweme_detail],
          }),
        )
      },
    }
    const post = await Effect.runPromise(
      douyinExtractor.extract(
        resource(`https://www.douyin.com/note/${imageId}`),
        transport,
      ),
    )
    expect(post.id).toBe(imageId)
    expect(seen).toHaveLength(2)
    expect(seen[0]?.headers.get("user-agent")).toBeNull()
    expect(seen[1]?.headers.get("user-agent")).toContain("aweme")
    expect(seen.every((item) => item.headers.get("cookie") === null)).toBe(true)
    expect(
      seen.every((item) => new URL(item.url).searchParams.has("a_bogus") === false),
    ).toBe(true)
  })

  test("matches a jingxuan or profile url that only carries modal_id", () => {
    expect(
      douyinExtractor.match(
        new URL(`https://www.douyin.com/jingxuan?modal_id=${videoId}`),
      ),
    ).toBe(true)
    expect(
      douyinExtractor.match(
        new URL(`https://www.douyin.com/user/MS4wLjABAAAA?modal_id=${videoId}`),
      ),
    ).toBe(true)
    expect(
      douyinExtractor.match(
        new URL(`https://m.douyin.com/share/video/${videoId}/`),
      ),
    ).toBe(true)
    expect(
      douyinExtractor.match(new URL("https://www.douyin.com/jingxuan?modal_id=abc")),
    ).toBe(false)
    expect(
      douyinExtractor.match(new URL("https://example.com/?modal_id=123")),
    ).toBe(false)
  })

  test("reads a jingxuan modal id from the public feed and skips slidesinfo", async () => {
    const seen: Request[] = []
    const transport: Transport = {
      request(input) {
        seen.push(input)
        return Effect.succeed(Response.json(videoFixture))
      },
    }
    const post = await Effect.runPromise(
      douyinExtractor.extract(
        resource(`https://www.douyin.com/jingxuan?modal_id=${videoId}`),
        transport,
      ),
    )
    expect(post.id).toBe(videoId)
    expect(post.canonicalUrl).toBe(`https://www.douyin.com/video/${videoId}`)
    expect(seen.some((item) => item.url.includes("/aweme/v1/feed/"))).toBe(true)
    expect(seen.some((item) => item.url.includes("slidesinfo"))).toBe(false)
  })

  test("asks slidesinfo when a modal id is absent from the public feed", async () => {
    const seen: Request[] = []
    const transport: Transport = {
      request(input) {
        seen.push(input)
        const url = new URL(input.url)
        if (url.pathname.includes("/aweme/v1/feed/")) {
          return Effect.succeed(Response.json({ status_code: 0, aweme_list: [] }))
        }
        return Effect.succeed(
          Response.json({
            status_code: 0,
            aweme_details: [imagePostFixture.aweme_detail],
          }),
        )
      },
    }
    const post = await Effect.runPromise(
      douyinExtractor.extract(
        resource(`https://www.douyin.com/user/MS4wLjABAAAA?modal_id=${imageId}`),
        transport,
      ),
    )
    expect(post.id).toBe(imageId)
    expect(post.canonicalUrl).toBe(`https://www.douyin.com/note/${imageId}`)
    expect(post.media.map((asset) => asset.type)).toEqual(["image", "image"])
    expect(seen.filter((item) => item.url.includes("slidesinfo"))).toHaveLength(1)
    expect(seen.some((item) => item.url.includes("/share/"))).toBe(false)
  })

  test("follows a short link that lands on a jingxuan modal id", async () => {
    const transport: Transport = {
      request(input) {
        const url = new URL(input.url)
        if (url.hostname === "v.douyin.com") {
          return Effect.succeed(
            new Response(null, {
              status: 302,
              headers: {
                location: `https://www.douyin.com/jingxuan?modal_id=${videoId}`,
              },
            }),
          )
        }
        return Effect.succeed(Response.json(videoFixture))
      },
    }
    const post = await Effect.runPromise(
      douyinExtractor.extract(resource("https://v.douyin.com/abc123/"), transport),
    )
    expect(post.id).toBe(videoId)
    expect(post.canonicalUrl).toBe(`https://www.douyin.com/video/${videoId}`)
  })
})
