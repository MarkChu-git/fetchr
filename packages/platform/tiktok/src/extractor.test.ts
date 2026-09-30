import { describe, expect, test } from "bun:test"
import { Effect, Result } from "effect"
import { extract, type CanonicalResource, type ExtractErrorCode, type Transport } from "@fetchr/core"
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

  test("resolves a short link before reading the page", async () => {
    const canonical = "https://www.tiktok.com/@name/video/7000000000000000001"
    const html = await fixture("video.html")
    const calls: string[] = []
    const transport: Transport = {
      request: (input) => {
        calls.push(new URL(input.url).hostname)
        const url = new URL(input.url)
        if (url.hostname === "vt.tiktok.com") {
          return Effect.succeed(
            new Response(null, { status: 302, headers: { location: canonical } }),
          )
        }
        return Effect.succeed(
          new Response(html, {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
        )
      },
    }
    const post = await Effect.runPromise(
      extract(
        "🔥 Check this out\nhttps://vt.tiktok.com/ZSxxxx/\ncopied from TikTok",
        transport,
        [tiktokExtractor],
      ),
    )
    expect(post.id).toBe("7000000000000000001")
    expect(post.canonicalUrl).toBe(canonical)
    expect(calls).toEqual(["vt.tiktok.com", "www.tiktok.com"])
  })

  test("does not fetch a private or credentialed redirect target", async () => {
    const calls: string[] = []
    const transport: Transport = {
      request: (input) => {
        calls.push(input.url)
        return Effect.succeed(
          new Response(null, {
            status: 302,
            headers: { location: "http://169.254.169.254/latest/meta-data" },
          }),
        )
      },
    }
    const result = await Effect.runPromise(
      Effect.result(
        tiktokExtractor.extract(
          { platform: "tiktok", url: new URL("https://vt.tiktok.com/ZSxxxx/") },
          transport,
        ),
      ),
    )
    expect(result._tag).toBe("Failure")
    if (result._tag !== "Failure") return
    expect(result.failure.code).toBe("RESOLVE_FAILED")
    expect(result.failure.cause).toBe("SHORT_LINK_RESOLVE_FAILED")
    expect(calls).toEqual(["https://vt.tiktok.com/ZSxxxx/"])
  })

  test("separates a missing payload, invalid JSON, a schema change, a block, and a fetch failure", async () => {
    const cases: ReadonlyArray<{
      readonly html: string
      readonly status?: number
      readonly contentType?: string
      readonly code: ExtractErrorCode
      readonly cause: string
    }> = [
      {
        html: "<html><body>short placeholder</body></html>",
        code: "PAYLOAD_MISSING",
        cause: "REHYDRATION_NOT_FOUND",
      },
      {
        html: `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">   </script>`,
        code: "PAYLOAD_MISSING",
        cause: "REHYDRATION_EMPTY",
      },
      {
        html: `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">{</script>`,
        code: "SCHEMA_CHANGED",
        cause: "REHYDRATION_INVALID_JSON",
      },
      {
        html: `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">{"a":1}</script>`,
        code: "SCHEMA_CHANGED",
        cause: "SCHEMA_CHANGED",
      },
      {
        html: `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">${JSON.stringify({
          __DEFAULT_SCOPE__: { "webapp.video-detail": { statusCode: 0 } },
        })}</script>`,
        code: "PAYLOAD_MISSING",
        cause: "MEDIA_DATA_NOT_FOUND",
      },
      {
        html: "<html>captcha</html>",
        code: "UPSTREAM_BLOCKED",
        cause: "UPSTREAM_BLOCKED",
      },
      {
        html: "<html>nope</html>",
        status: 403,
        code: "UPSTREAM_BLOCKED",
        cause: "UPSTREAM_BLOCKED",
      },
      {
        html: "<html>error</html>",
        status: 500,
        code: "SOURCE_UNAVAILABLE",
        cause: "UPSTREAM_FETCH_FAILED",
      },
    ]

    for (const item of cases) {
      const result = await Effect.runPromise(
        Effect.result(
          tiktokExtractor.extract(
            videoResource,
            statusTransport(item.html, item.status ?? 200, item.contentType ?? "text/html"),
          ),
        ),
      )
      expect(result._tag).toBe("Failure")
      if (result._tag !== "Failure") continue
      expect(result.failure.code).toBe(item.code)
      expect(result.failure.cause).toBe(item.cause)
    }
  })
})

function statusTransport(html: string, status: number, contentType: string): Transport {
  return {
    request: () =>
      Effect.succeed(
        new Response(html, {
          status,
          headers: { "content-type": contentType },
        }),
      ),
  }
}
