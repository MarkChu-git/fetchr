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
        type: "direct",
        url: "https://cdn.example/media/clip.mp4",
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

  test("normalizes a video fixture into a MediaPost", async () => {
    const post = await Effect.runPromise(
      douyinExtractor.extract(
        resource(`https://www.douyin.com/video/${videoId}`, videoId),
        fixtureTransport({ [videoId]: videoFixture }),
      ),
    )
    expect(post).toEqual(videoPost)
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
})
