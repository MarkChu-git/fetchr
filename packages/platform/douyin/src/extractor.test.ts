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
    {
      type: "video",
      id: `${videoId}:720p`,
      width: 720,
      height: 1280,
      thumbnail: "https://cdn.example/covers/clip.jpg",
      bitrate: 1155701,
      bytes: 1878014,
      delivery: {
        type: "proxy",
        token: "pending",
        upstreamUrl: "https://cdn.example/media/clip-720.mp4",
        upstreamHeaders: { Referer: "https://www.douyin.com/" },
      },
    },
    {
      type: "video",
      id: `${videoId}:540p`,
      width: 720,
      height: 1280,
      thumbnail: "https://cdn.example/covers/clip.jpg",
      bitrate: 794713,
      bytes: 1291409,
      delivery: {
        type: "proxy",
        token: "pending",
        upstreamUrl: "https://cdn.example/media/clip-540.mp4",
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

  test("matches a short link whose code uses the base64url alphabet", () => {
    expect(
      douyinExtractor.match(new URL("https://v.douyin.com/SEuA_uLPhnw/")),
    ).toBe(true)
    expect(douyinExtractor.match(new URL("https://v.douyin.com/a-b_c/"))).toBe(
      true,
    )
  })

  test("matches an http short link", () => {
    expect(douyinExtractor.match(new URL("http://v.douyin.com/abc123/"))).toBe(
      true,
    )
    expect(
      douyinExtractor.match(new URL("http://www.douyin.com/video/7000000000000000001")),
    ).toBe(true)
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
    expect(post.media).toHaveLength(4)
    const original = post.media[0]?.delivery
    const fallback = post.media[1]?.delivery
    expect(post.media[1]?.id).toBe(`${videoId}:browser`)
    // Douyin's own renditions follow as labeled quality downloads.
    expect(post.media[2]?.id).toBe(`${videoId}:720p`)
    expect(post.media[3]?.id).toBe(`${videoId}:540p`)
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

  test("fails when the feed does not include this work", async () => {
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

  test("picks the browser-renderable avatar when HEIC comes first", async () => {
    const fixture = {
      status_code: 0,
      aweme_detail: {
        ...videoFixture.aweme_detail,
        author: {
          ...videoFixture.aweme_detail.author,
          avatar_thumb: {
            url_list: [
              "https://p3.douyinpic.com/aweme/100x100/avatar.heic?from=feed",
              "https://p3.douyinpic.com/aweme/100x100/avatar.jpeg?from=feed",
            ],
          },
        },
      },
    }
    const transport: Transport = {
      request() {
        return Effect.succeed(Response.json(fixture))
      },
    }
    const post = await Effect.runPromise(
      douyinExtractor.extract(
        resource(`https://www.douyin.com/video/${videoId}`, videoId),
        transport,
      ),
    )
    expect(post.author?.avatar).toBe(
      "https://p3.douyinpic.com/aweme/100x100/avatar.jpeg?from=feed",
    )
  })

  test("omits the avatar when every variant is HEIC", async () => {
    const fixture = {
      status_code: 0,
      aweme_detail: {
        ...videoFixture.aweme_detail,
        author: {
          ...videoFixture.aweme_detail.author,
          avatar_thumb: {
            url_list: ["https://p3.douyinpic.com/aweme/100x100/avatar.heic"],
          },
        },
      },
    }
    const transport: Transport = {
      request() {
        return Effect.succeed(Response.json(fixture))
      },
    }
    const post = await Effect.runPromise(
      douyinExtractor.extract(
        resource(`https://www.douyin.com/video/${videoId}`, videoId),
        transport,
      ),
    )
    expect(post.author?.avatar).toBeUndefined()
    expect(post.author?.name).toBe("fixture-author")
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

  test("resolves an http short link into the same video MediaPost", async () => {
    const post = await Effect.runPromise(
      douyinExtractor.extract(
        resource("http://v.douyin.com/abc123/"),
        fixtureTransport({ [videoId]: videoFixture }),
      ),
    )
    expect(post).toEqual(videoPost)
  })

  test("walks the chain when the first redirect does not name a post", async () => {
    const transport: Transport = {
      request(input) {
        const url = new URL(input.url)
        if (url.hostname === "v.douyin.com" && url.pathname === "/first/") {
          return Effect.succeed(
            new Response(null, {
              status: 302,
              headers: { location: "https://v.douyin.com/second/" },
            }),
          )
        }
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
        if (url.hostname === "www.douyin.com") {
          // The walker only needs the final URL. A 200 page ends the chain.
          return Effect.succeed(new Response("ok"))
        }
        return Effect.succeed(Response.json(videoFixture))
      },
    }
    const post = await Effect.runPromise(
      douyinExtractor.extract(resource("https://v.douyin.com/first/"), transport),
    )
    expect(post.id).toBe(videoId)
  })

  test("rejects a short link chain that leaves the douyin hosts", async () => {
    const transport: Transport = {
      request(input) {
        const url = new URL(input.url)
        if (url.hostname === "v.douyin.com") {
          return Effect.succeed(
            new Response(null, {
              status: 302,
              headers: { location: "https://example.com/landing" },
            }),
          )
        }
        return Effect.succeed(Response.json(videoFixture))
      },
    }
    const failure = await failureOf(
      douyinExtractor.extract(resource("https://v.douyin.com/abc123/"), transport),
    )
    expect(failure.code).toBe("RESOLVE_FAILED")
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

  test("skips heic stills and keeps the asset when nothing is browser-safe", async () => {
    const fixture = {
      status_code: 0,
      aweme_list: [
        {
          aweme_id: imageId,
          desc: "live photo stills",
          images: [
            {
              url_list: [
                "https://p3-sign.douyinpic.com/tos/still.heic",
                "https://p3-sign.douyinpic.com/tos/still.jpeg",
              ],
            },
            {
              url_list: ["https://p3-sign.douyinpic.com/tos/only.webp"],
            },
          ],
        },
      ],
    }
    const transport: Transport = {
      request() {
        return Effect.succeed(Response.json(fixture))
      },
    }
    const post = await Effect.runPromise(
      douyinExtractor.extract(
        resource(`https://www.douyin.com/note/${imageId}`),
        transport,
      ),
    )
    expect(post.media).toHaveLength(2)
    // The jpeg wins over the HEIC original for the first image.
    expect(post.media[0]?.delivery).toMatchObject({
      type: "proxy",
      upstreamUrl: "https://p3-sign.douyinpic.com/tos/still.jpeg",
    })
    // A webp-only list still yields a downloadable asset instead of dropping the image.
    expect(post.media[1]?.delivery).toMatchObject({
      type: "proxy",
      upstreamUrl: "https://p3-sign.douyinpic.com/tos/only.webp",
    })
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

  test("reads a note from the feed without fetching the share page", async () => {
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
            aweme_list: [{ aweme_id: "other" }, imagePostFixture.aweme_detail],
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
    const feed = seen.find((item) => item.url.includes("/aweme/v1/feed/"))
    expect(feed).toBeDefined()
    if (feed === undefined) return
    const feedUrl = new URL(feed.url)
    expect(feedUrl.searchParams.get("aweme_id")).toBe(imageId)
    // The feed honors aweme_id only with the full client parameter set.
    expect(feedUrl.searchParams.get("version_code")).toBe("320901")
    expect(seen.some((item) => item.url.includes("/share/slides"))).toBe(false)
    expect(seen.some((item) => item.url.includes("ttwid"))).toBe(false)
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
                aweme_list: [
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

  test("reads a jingxuan modal id from the public feed", async () => {
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
    expect(seen.every((item) => item.url.includes("/aweme/v1/feed/"))).toBe(true)
  })

  test("a modal id pointing to a note resolves through the feed and rewrites the canonical URL", async () => {
    const transport: Transport = {
      request() {
        return Effect.succeed(
          Response.json({
            status_code: 0,
            aweme_list: [imagePostFixture.aweme_detail],
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
