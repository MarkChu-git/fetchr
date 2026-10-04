import { describe, expect, test } from "bun:test"
import type {
  CanonicalResource,
  ExtractFailure,
  MediaPost,
  Transport,
} from "@fetchr/core"
import { Effect, Result } from "effect"
import { instagramExtractor } from "./index"

async function loadFixture(name: string): Promise<string> {
  return Bun.file(new URL(`../fixtures/${name}.html`, import.meta.url)).text()
}

function resource(href: string): CanonicalResource {
  return { platform: "instagram", url: new URL(href) }
}

function transportFor(routes: {
  readonly crawler: string
  readonly embed?: string
  readonly crawlerStatus?: number
  readonly embedStatus?: number
}): {
  readonly transport: Transport
  readonly requests: Request[]
} {
  const requests: Request[] = []
  return {
    requests,
    transport: {
      request(input) {
        requests.push(input)
        const isEmbed = input.url.endsWith("/embed")
        const body = isEmbed ? (routes.embed ?? "") : routes.crawler
        const status = isEmbed
          ? (routes.embedStatus ?? 200)
          : (routes.crawlerStatus ?? 200)
        return Effect.succeed(
          new Response(body, {
            status,
            headers: { "content-type": "text/html" },
          }),
        )
      },
    },
  }
}

async function extract(
  href: string,
  routes: {
    readonly crawler: string
    readonly embed?: string
    readonly crawlerStatus?: number
    readonly embedStatus?: number
  },
): Promise<{
  readonly result: Result.Result<MediaPost, ExtractFailure>
  readonly requests: Request[]
}> {
  const { transport, requests } = transportFor(routes)
  const result = await Effect.runPromise(
    Effect.result(instagramExtractor.extract(resource(href), transport)),
  )
  return { result, requests }
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
  code: ExtractFailure["code"],
): void {
  if (!Result.isFailure(result)) {
    throw new Error("expected an extract failure")
  }
  expect(result.failure.code).toBe(code)
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
    expectFailure(result, "UNSUPPORTED_URL")
  })

  test("normalizes a crawler reel into the original video asset", async () => {
    const crawler = await loadFixture("crawler-reel")
    const { result, requests } = await extract(
      "https://www.instagram.com/reel/DZJwSuXom8P/",
      { crawler },
    )
    expect(requests).toHaveLength(1)
    expect(requests[0]?.headers.get("user-agent")).toContain("Googlebot")
    const post = expectSuccess(result)
    expect(post.platform).toBe("instagram")
    expect(post.id).toBe("DZJwSuXom8P")
    expect(post.canonicalUrl).toBe("https://www.instagram.com/reel/DZJwSuXom8P/")
    expect(post.author?.username).toBe("_hiraanizamani101")
    expect(post.author?.profileUrl).toBe(
      "https://www.instagram.com/_hiraanizamani101/",
    )
    expect(post.description).toContain("paste reel link in comments")
    expect(post.publishedAt).toBe(new Date(1780551335 * 1000).toISOString())
    expect(post.media).toHaveLength(1)
    const media = post.media[0]
    if (media?.type !== "video") throw new Error("expected a video asset")
    expect(media.width).toBe(720)
    expect(media.height).toBe(1280)
    expect("thumbnail" in media).toBe(false)
    expect(media.delivery).toEqual({
      type: "proxy",
      token: "pending",
      upstreamUrl: expect.stringContaining("fbcdn.net"),
      upstreamHeaders: { Referer: "https://www.instagram.com/" },
    })
  })

  test("normalizes a crawler image post into the original image", async () => {
    const crawler = await loadFixture("crawler-image")
    const { result } = await extract("https://www.instagram.com/p/CiKgnBEPU9g/", {
      crawler,
    })
    const post = expectSuccess(result)
    expect(post.author?.username).toBe("digitalmarketingtrending")
    const media = post.media[0]
    if (media?.type !== "image") throw new Error("expected an image asset")
    expect(media.width).toBe(1080)
    expect(media.height).toBe(1350)
  })

  test("normalizes a crawler carousel into per-child video assets", async () => {
    const crawler = await loadFixture("crawler-carousel")
    const { result } = await extract(
      "https://www.instagram.com/p/DeCowlSjyeV/",
      { crawler },
    )
    const post = expectSuccess(result)
    expect(post.media).toHaveLength(2)
    for (const [index, media] of post.media.entries()) {
      if (media.type !== "video") throw new Error("expected a video asset")
      expect(media.id).toBe(`DeCowlSjyeV:${index + 1}`)
      expect(media.width).toBe(720)
      expect(media.height).toBe(1280)
    }
  })

  test("falls back to the embed page when the crawler page has no media", async () => {
    const { result, requests } = await extract(
      "https://www.instagram.com/reel/DZJwSuXom8P/",
      {
        crawler: await loadFixture("gone"),
        embed: await loadFixture("embed-reel"),
      },
    )
    expect(requests).toHaveLength(2)
    expect(requests[1]?.url).toBe(
      "https://www.instagram.com/p/DZJwSuXom8P/embed",
    )
    const post = expectSuccess(result)
    expect(post.media[0]?.type).toBe("video")
    if (post.media[0]?.type === "video") {
      expect(post.media[0].delivery).toEqual({
        type: "proxy",
        token: "pending",
        upstreamUrl:
          "https://instagram.fkul10-2.fna.fbcdn.net/o1/v/t2/f2/m86/video.mp4?oh=abc&oe=def",
        upstreamHeaders: { Referer: "https://www.instagram.com/" },
      })
    }
  })

  test("reports LOGIN_REQUIRED when the embed video omits video_url", async () => {
    const { result } = await extract(
      "https://www.instagram.com/reel/DI9E3YvAzzV/",
      {
        crawler: await loadFixture("gone"),
        embed: await loadFixture("embed-reel-novideo"),
      },
    )
    expectFailure(result, "LOGIN_REQUIRED")
  })

  test("reports PRIVATE_MEDIA when only an og:image survives", async () => {
    const { result } = await extract("https://www.instagram.com/p/PRIVATE1/", {
      crawler: await loadFixture("private"),
      embed: await loadFixture("gone"),
    })
    expectFailure(result, "PRIVATE_MEDIA")
  })

  test("reports MEDIA_NOT_FOUND when nothing renders", async () => {
    const { result } = await extract("https://www.instagram.com/p/ZZZZZZZZZZZ/", {
      crawler: await loadFixture("gone"),
      embed: await loadFixture("gone"),
    })
    expectFailure(result, "MEDIA_NOT_FOUND")
  })

  test("keeps the genuine upload resolution even when it is low", async () => {
    const crawler = await loadFixture("crawler-lowres")
    const { result } = await extract(
      "https://www.instagram.com/reel/DISz1RfNd3K/",
      { crawler },
    )
    const media = expectSuccess(result).media[0]
    if (media?.type !== "video") throw new Error("expected a video asset")
    expect(media.width).toBe(360)
    expect(media.height).toBe(640)
  })

  test("reports RATE_LIMITED when the crawler page is throttled", async () => {
    const { result } = await extract("https://www.instagram.com/reel/X/", {
      crawler: "",
      crawlerStatus: 429,
    })
    expectFailure(result, "RATE_LIMITED")
  })

  test("reports RATE_LIMITED when only the embed is throttled", async () => {
    const { result } = await extract("https://www.instagram.com/reel/X/", {
      crawler: await loadFixture("gone"),
      embed: "",
      embedStatus: 429,
    })
    expectFailure(result, "RATE_LIMITED")
  })

  test("reports MEDIA_NOT_FOUND for a 404 crawler page", async () => {
    const { result } = await extract("https://www.instagram.com/p/GONE404/", {
      crawler: "",
      crawlerStatus: 404,
    })
    expectFailure(result, "MEDIA_NOT_FOUND")
  })

  test("reports SOURCE_UNAVAILABLE for a 5xx crawler page", async () => {
    const { result } = await extract("https://www.instagram.com/reel/X/", {
      crawler: "",
      crawlerStatus: 502,
    })
    expectFailure(result, "SOURCE_UNAVAILABLE")
  })

  test("reports LOGIN_REQUIRED when the post is gated for logged-out clients", async () => {
    const gated = `<!DOCTYPE html><html><body><script>{"require":[["x",null,[{"data":{"xig_polaris_media":{"if_gated_logged_out":{}}}}]]]}</script></body></html>`
    const { result } = await extract("https://www.instagram.com/reel/GATED1/", {
      crawler: gated,
      embed: await loadFixture("gone"),
    })
    expectFailure(result, "LOGIN_REQUIRED")
  })

  test("skips crawler media whose shortcode does not match the request", async () => {
    const other = (await loadFixture("crawler-image")).replaceAll(
      "CiKgnBEPU9g",
      "OTHERCODE1",
    )
    const reel = await loadFixture("crawler-reel")
    // A page that first exposes another post's media, then ours.
    const merged = other.replace(
      "</body></html>",
      reel.match(/<script[^>]*>([\s\S]*?)<\/script>/i)?.[0] ?? "",
    )
    const { result } = await extract(
      "https://www.instagram.com/reel/DZJwSuXom8P/",
      { crawler: merged },
    )
    const post = expectSuccess(result)
    expect(post.id).toBe("DZJwSuXom8P")
    expect(post.media[0]?.type).toBe("video")
  })
})
