import { describe, expect, test } from "bun:test"
import type {
  CanonicalResource,
  ExtractFailure,
  MediaPost,
  Transport,
} from "@fetchr/core"
import { Effect, Result } from "effect"
import { instagramExtractor } from "./index"

const author = {
  username: "fixture_author",
  name: "Fixture Author",
  profileUrl: "https://www.instagram.com/fixture_author/",
}

function parseJson(text: string): unknown {
  return JSON.parse(text)
}

async function loadFixture(name: string): Promise<unknown> {
  const file = Bun.file(new URL(`../fixtures/${name}.json`, import.meta.url))
  return parseJson(await file.text())
}

function resource(href: string): CanonicalResource {
  return { platform: "instagram", url: new URL(href) }
}

function transportFor(body: unknown): {
  readonly transport: Transport
  readonly requests: Request[]
} {
  const requests: Request[] = []
  return {
    requests,
    transport: {
      request(input) {
        requests.push(input)
        return Effect.succeed(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        )
      },
    },
  }
}

async function extract(
  href: string,
  fixture: string,
): Promise<Result.Result<MediaPost, ExtractFailure>> {
  const body = await loadFixture(fixture)
  const { transport, requests } = transportFor(body)
  const result = await Effect.runPromise(
    Effect.result(instagramExtractor.extract(resource(href), transport)),
  )
  expect(requests).toHaveLength(1)
  const request = requests[0]
  expect(request?.method).toBe("GET")
  expect(request?.url).toBe(href)
  expect(request?.headers.get("cookie")).toBeNull()
  return result
}

function expectSuccess(
  result: Result.Result<MediaPost, ExtractFailure>,
): MediaPost {
  if (!Result.isSuccess(result)) {
    throw new Error(`${result.failure.code}: ${result.failure.message}`)
  }
  return result.success
}

function expectFailure(
  result: Result.Result<MediaPost, ExtractFailure>,
  expected: ExtractFailure,
): void {
  if (!Result.isFailure(result)) {
    throw new Error("expected an extract failure")
  }
  expect(result.failure).toEqual(expected)
}

describe("instagram extractor", () => {
  test("reports the instagram platform", () => {
    expect(instagramExtractor.platform).toBe("instagram")
  })

  test("matches a public post, a reel, and a profile reel", () => {
    const accepted = [
      "https://www.instagram.com/p/ABC123/",
      "https://www.instagram.com/reel/ABC123/",
      "https://www.instagram.com/username/reel/ABC123/",
    ]
    for (const href of accepted) {
      expect(instagramExtractor.match(new URL(href))).toBe(true)
    }
  })

  test("rejects unrelated URLs", () => {
    const rejected = [
      "https://example.com/",
      "https://www.tiktok.com/@a/video/1",
    ]
    for (const href of rejected) {
      expect(instagramExtractor.match(new URL(href))).toBe(false)
    }
  })

  test("does not request an unrelated URL", async () => {
    let called = false
    const transport: Transport = {
      request() {
        called = true
        return Effect.fail({
          code: "SOURCE_UNAVAILABLE",
          message: "should not request",
        })
      },
    }
    const result = await Effect.runPromise(
      Effect.result(
        instagramExtractor.extract(
          {
            platform: "instagram",
            url: new URL("https://www.tiktok.com/@a/video/1"),
          },
          transport,
        ),
      ),
    )
    expect(called).toBe(false)
    expectFailure(result, {
      code: "UNSUPPORTED_URL",
      message: "URL is not a public Instagram post or reel",
    })
  })

  test("normalizes a public image into one direct image", async () => {
    const result = await extract("https://www.instagram.com/p/ABC123/", "image")
    expect(expectSuccess(result)).toEqual({
      platform: "instagram",
      id: "ABC123",
      canonicalUrl: "https://www.instagram.com/p/ABC123/",
      author,
      description: "a public photo",
      media: [
        {
          type: "image",
          id: "ABC123",
          width: 1080,
          height: 1350,
          delivery: {
            type: "direct",
            url: "https://cdn.example.test/instagram/ABC123.jpg",
          },
        },
      ],
    })
  })

  test("normalizes a carousel into two images and proxies only a Referer CDN", async () => {
    const result = await extract(
      "https://www.instagram.com/p/ABC123/",
      "carousel",
    )
    expect(expectSuccess(result)).toEqual({
      platform: "instagram",
      id: "ABC123",
      canonicalUrl: "https://www.instagram.com/p/ABC123/",
      author,
      media: [
        {
          type: "image",
          id: "ABC123:1",
          width: 1080,
          height: 1080,
          delivery: {
            type: "direct",
            url: "https://cdn.example.test/instagram/ABC123-1.jpg",
          },
        },
        {
          type: "image",
          id: "ABC123:2",
          width: 1080,
          height: 1440,
          delivery: {
            type: "proxy",
            token: "pending",
            upstreamUrl: "https://scontent.xx.fbcdn.net/v/ABC123-2.jpg",
            upstreamHeaders: { Referer: "https://www.instagram.com/" },
          },
        },
      ],
    })
  })

  test("normalizes a reel into one video and proxies a Referer CDN", async () => {
    const profileReel = await extract(
      "https://www.instagram.com/username/reel/ABC123/",
      "reel",
    )
    const reel = await extract(
      "https://www.instagram.com/reel/ABC123/",
      "reel",
    )
    const expected: MediaPost = {
      platform: "instagram",
      id: "ABC123",
      canonicalUrl: "https://www.instagram.com/reel/ABC123/",
      author,
      description: "a public reel",
      media: [
        {
          type: "video",
          id: "ABC123",
          width: 720,
          height: 1280,
          thumbnail: "https://cdn.example.test/instagram/ABC123-cover.jpg",
          delivery: {
            type: "proxy",
            token: "pending",
            upstreamUrl: "https://scontent.cdninstagram.com/v/ABC123.mp4",
            upstreamHeaders: { Referer: "https://www.instagram.com/" },
          },
        },
      ],
    }
    expect(expectSuccess(profileReel)).toEqual(expected)
    expect(expectSuccess(reel)).toEqual(expected)
  })

  test("returns PRIVATE_MEDIA for a private fixture", async () => {
    const result = await extract(
      "https://www.instagram.com/p/ABC123/",
      "private",
    )
    expectFailure(result, {
      code: "PRIVATE_MEDIA",
      message: "This Instagram post is private",
    })
  })

  test("returns LOGIN_REQUIRED for a login-wall fixture", async () => {
    const result = await extract(
      "https://www.instagram.com/p/ABC123/",
      "login-wall",
    )
    expectFailure(result, {
      code: "LOGIN_REQUIRED",
      message: "Instagram requires a login to view this post",
    })
  })
})
