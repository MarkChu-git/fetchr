import { describe, expect, test } from "bun:test"
import { Effect, Result } from "effect"
import type { CanonicalResource, Transport } from "@fetchr/core"
import { tiktokExtractor } from "./index"

const videoUrl = new URL(
  "https://www.tiktok.com/@name/video/7000000000000000001",
)

const videoResource: CanonicalResource = {
  platform: "tiktok",
  id: "7000000000000000001",
  url: videoUrl,
}

const pageTransport = (html: string): Transport => ({
  request: () =>
    Effect.succeed(
      new Response(html, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    ),
})

const fixture = (name: string) =>
  Bun.file(new URL(`./fixtures/${name}`, import.meta.url)).text()

describe("tiktokExtractor.match", () => {
  test("accepts a canonical video url and a vm short link", () => {
    expect(
      tiktokExtractor.match(
        new URL("https://www.tiktok.com/@name/video/7000000000000000001"),
      ),
    ).toBe(true)
    expect(tiktokExtractor.match(new URL("https://vm.tiktok.com/ABC123/"))).toBe(
      true,
    )
  })

  test("rejects douyin and unrelated hosts", () => {
    expect(tiktokExtractor.match(new URL("https://www.douyin.com/video/1"))).toBe(
      false,
    )
    expect(tiktokExtractor.match(new URL("https://example.com/"))).toBe(false)
  })
})

describe("tiktokExtractor.extract", () => {
  test("normalizes a public video page into one proxied video", async () => {
    const result = await Effect.runPromise(
      Effect.result(
        tiktokExtractor.extract(
          videoResource,
          pageTransport(await fixture("video.html")),
        ),
      ),
    )

    expect(Result.isSuccess(result)).toBe(true)
    if (result._tag !== "Success") return
    expect(result.success).toEqual({
      platform: "tiktok",
      id: "7000000000000000001",
      canonicalUrl: videoUrl.href,
      author: {
        id: "9000000000000000002",
        name: "Anon",
        username: "anon",
        avatar: "https://p16.example.test/avatar.jpg",
      },
      description: "anonymous public caption",
      thumbnail: "https://p16.example.test/cover.jpg",
      media: [
        {
          type: "video",
          id: "7000000000000000001",
          thumbnail: "https://p16.example.test/cover.jpg",
          width: 576,
          height: 1024,
          delivery: {
            type: "proxy",
            token: "pending",
            upstreamUrl: "https://v16.example.test/play.mp4",
            upstreamHeaders: { Referer: "https://www.tiktok.com/" },
          },
        },
      ],
    })
  })

  test("returns PRIVATE_MEDIA for a private video page", async () => {
    const result = await Effect.runPromise(
      Effect.result(
        tiktokExtractor.extract(
          videoResource,
          pageTransport(await fixture("private.html")),
        ),
      ),
    )

    expect(Result.isFailure(result)).toBe(true)
    if (result._tag !== "Failure") return
    expect(result.failure.code).toBe("PRIVATE_MEDIA")
  })
})
