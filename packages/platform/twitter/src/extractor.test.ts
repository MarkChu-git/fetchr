import { describe, expect, test } from "bun:test"
import type { CanonicalResource, ExtractFailure, MediaPost, Transport } from "@fetchr/core"
import { Cause, Effect, Exit } from "effect"
import { twitterExtractor } from "@fetchr/platform-twitter"
import authorizedVideo from "../fixtures/authorized-video.json" with { type: "json" }
import photo from "../fixtures/photo.json" with { type: "json" }
import protectedTweet from "../fixtures/protected.json" with { type: "json" }
import video from "../fixtures/video.json" with { type: "json" }

function status(url: string, id: string): CanonicalResource {
  return { platform: "twitter", id, url: new URL(url) }
}

function fixtureTransport(body: unknown): {
  readonly transport: Transport
  readonly requests: readonly Request[]
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

function expectAnonymousSyndication(request: Request | undefined, id: string) {
  if (request === undefined) throw new Error("expected a syndication request")
  const url = new URL(request.url)
  expect(url.hostname).toBe("cdn.syndication.twimg.com")
  expect(url.pathname).toBe("/tweet-result")
  expect(url.searchParams.get("id")).toBe(id)
  expect(url.hostname).not.toBe("x.com")
  expect(url.hostname).not.toBe("twitter.com")
  expect(request.headers.get("cookie")).toBeNull()
  expect(request.headers.get("authorization")).toBeNull()
}

async function extractPost(
  resource: CanonicalResource,
  body: unknown,
): Promise<{ readonly post: MediaPost; readonly requests: readonly Request[] }> {
  const { transport, requests } = fixtureTransport(body)
  const post = await Effect.runPromise(twitterExtractor.extract(resource, transport))
  return { post, requests }
}

async function extractError(
  resource: CanonicalResource,
  body: unknown,
): Promise<{ readonly failure: ExtractFailure; readonly requests: readonly Request[] }> {
  const { transport, requests } = fixtureTransport(body)
  const exit = await Effect.runPromiseExit(twitterExtractor.extract(resource, transport))
  if (Exit.isSuccess(exit)) throw new Error("expected extract to fail")
  const reason = exit.cause.reasons[0]
  if (reason === undefined || !Cause.isFailReason(reason)) {
    throw new Error("expected a typed extract failure")
  }
  return { failure: reason.error, requests }
}

describe("twitterExtractor.match", () => {
  test("accepts an x.com status URL", () => {
    expect(twitterExtractor.match(new URL("https://x.com/name/status/123"))).toBe(true)
  })

  test("accepts a twitter.com status URL", () => {
    expect(twitterExtractor.match(new URL("https://twitter.com/name/status/123"))).toBe(true)
  })

  test("rejects an unrelated host", () => {
    expect(twitterExtractor.match(new URL("https://example.com/"))).toBe(false)
  })
})

describe("twitterExtractor.extract", () => {
  test("normalizes a photo fixture into two direct images", async () => {
    const { post, requests } = await extractPost(
      status("https://x.com/name/status/123", "123"),
      photo,
    )

    expectAnonymousSyndication(requests[0], "123")
    expect(post.platform).toBe("twitter")
    expect(post.id).toBe("123")
    expect(post.canonicalUrl).toBe("https://x.com/name/status/123")
    expect(post.author?.username).toBe("fixture_author")
    expect(post.description).toBe("two public photos")
    expect(post.media).toHaveLength(2)
    expect(post.media[0]).toMatchObject({
      type: "image",
      width: 1200,
      height: 800,
      delivery: {
        type: "direct",
        url: "https://pbs.twimg.com/media/photo-one.jpg",
      },
    })
    expect(post.media[1]).toMatchObject({
      type: "image",
      width: 640,
      height: 640,
      delivery: {
        type: "direct",
        url: "https://pbs.twimg.com/media/photo-two.jpg",
      },
    })
  })

  test("normalizes a video fixture into one direct video", async () => {
    const { post, requests } = await extractPost(
      status("https://twitter.com/video_author/status/456", "456"),
      video,
    )

    expectAnonymousSyndication(requests[0], "456")
    expect(post.platform).toBe("twitter")
    expect(post.id).toBe("456")
    expect(post.author?.username).toBe("video_author")
    expect(post.media).toHaveLength(1)
    expect(post.media[0]).toMatchObject({
      type: "video",
      thumbnail: "https://pbs.twimg.com/amplify_video_thumb/456/img/poster.jpg",
      delivery: {
        type: "direct",
        url: "https://video.twimg.com/ext_tw_video/456/pu/vid/720x1280/public.mp4",
      },
    })
  })

  test("returns PRIVATE_MEDIA for a protected account fixture", async () => {
    const { failure, requests } = await extractError(
      status("https://x.com/hidden/status/789", "789"),
      protectedTweet,
    )

    expectAnonymousSyndication(requests[0], "789")
    expect(failure.code).toBe("PRIVATE_MEDIA")
    expect(failure.message).toBe("This post is from a protected account.")
  })

  test("uses a pending proxy token when media needs a cookie or authorization header", async () => {
    const { post, requests } = await extractPost(
      status("https://x.com/locked_media/status/321", "321"),
      authorizedVideo,
    )

    expectAnonymousSyndication(requests[0], "321")
    expect(post.media).toHaveLength(1)
    expect(post.media[0]?.type).toBe("video")
    if (post.media[0]?.type !== "video") throw new Error("expected a video")
    expect(post.media[0].delivery).toEqual({ type: "proxy", token: "pending" })
    const encoded = JSON.stringify(post)
    expect(encoded).not.toContain("auth_token=secret")
    expect(encoded).not.toContain("Bearer guest")
    expect(encoded).not.toContain("https://video.twimg.com/ext_tw_video/321/pu/vid/720x720/locked.mp4")
  })
})
