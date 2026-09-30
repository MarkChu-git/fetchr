import { describe, expect, test } from "bun:test"
import { sign } from "@fetchr/delivery"
import { resetGuards } from "./guard"
import { openProxyDownload, proxySecret } from "./product"

/**
 * Workers fetch does not send a User-Agent on its own.
 * An empty identifier gets Access Denied from Bilibili's Akamai, so fill one in when it is missing.
 * If the platform already set one, keep that value.
 */
const fallbackUserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

async function tokenFor(headers: Readonly<Record<string, string>>): Promise<string> {
  return sign({
    url: "https://cdn.example/video.mp4",
    headers,
    platform: "bilibili",
    issuedAt: 1_000,
    secret: proxySecret(),
  })
}

function captureFetch(status = 200): {
  readonly fetchImpl: typeof fetch
  readonly userAgent: () => string | null
  readonly referer: () => string | null
  readonly range: () => string | null
} {
  let userAgent: string | null = null
  let referer: string | null = null
  let range: string | null = null
  const fetchImpl = (async (_input, init) => {
    const headers = new Headers(init?.headers)
    userAgent = headers.get("user-agent")
    referer = headers.get("referer")
    range = headers.get("range")
    const responseHeaders = new Headers({ "content-type": "video/mp4" })
    if (status === 206) {
      responseHeaders.set("content-range", "bytes 0-7/8")
      responseHeaders.set("accept-ranges", "bytes")
      responseHeaders.set("content-length", "8")
    }
    return new Response(new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]), {
      status,
      headers: responseHeaders,
    })
  }) as typeof fetch
  return {
    fetchImpl,
    userAgent: () => userAgent,
    referer: () => referer,
    range: () => range,
  }
}

describe("openProxyDownload", () => {
  test("adds a browser user agent when the token has none", async () => {
    resetGuards()
    const captured = captureFetch()
    const token = await tokenFor({ Referer: "https://www.bilibili.com/" })
    const response = await openProxyDownload(
      token,
      1_000,
      "203.0.113.10",
      captured.fetchImpl,
    )
    expect(response.status).toBe(200)
    expect(captured.referer()).toBe("https://www.bilibili.com/")
    expect(captured.userAgent()).toBe(fallbackUserAgent)
  })

  test("keeps the user agent a platform already chose", async () => {
    resetGuards()
    const captured = captureFetch()
    const token = await tokenFor({
      Referer: "https://www.bilibili.com/",
      "User-Agent": "platform-ua",
    })
    const response = await openProxyDownload(
      token,
      1_000,
      "203.0.113.11",
      captured.fetchImpl,
    )
    expect(response.status).toBe(200)
    expect(captured.userAgent()).toBe("platform-ua")
  })

  test("follows one public redirect and streams the final file", async () => {
    resetGuards()
    const seen: string[] = []
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const href = input instanceof Request ? input.url : input.toString()
      seen.push(href)
      if (seen.length === 1) {
        return new Response(null, {
          status: 302,
          headers: { location: "https://cdn.example/high.mp4" },
        })
      }
      return new Response(new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]), {
        status: 200,
        headers: { "content-type": "video/mp4", "content-length": "8" },
      })
    }) as typeof fetch
    const token = await tokenFor({ Referer: "https://www.douyin.com/" })
    const response = await openProxyDownload(
      token,
      1_000,
      "203.0.113.13",
      fetchImpl,
      { range: "bytes=0-", inline: true },
    )
    expect(response.status).toBe(200)
    expect(seen).toEqual([
      "https://cdn.example/video.mp4",
      "https://cdn.example/high.mp4",
    ])
    expect(response.headers.get("content-type")).toBe("video/mp4")
    expect(response.headers.get("content-disposition")).toMatch(/^inline;/)
  })

  test("rejects a redirect to a local address", async () => {
    resetGuards()
    const seen: string[] = []
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const href = input instanceof Request ? input.url : input.toString()
      seen.push(href)
      return new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/secret" },
      })
    }) as typeof fetch
    const token = await tokenFor({ Referer: "https://www.douyin.com/" })
    const response = await openProxyDownload(
      token,
      1_000,
      "203.0.113.14",
      fetchImpl,
    )
    expect(response.status).toBe(403)
    expect(await response.text()).toBe("上游跳转被拒绝")
    expect(seen).toEqual(["https://cdn.example/video.mp4"])
  })

  test("names a bad token in the page language", async () => {
    resetGuards()
    const chinese = await openProxyDownload("not-a-token", 1_000, "203.0.113.20")
    expect(chinese.status).toBe(403)
    expect(await chinese.text()).toBe("下载链接无效")
    const english = await openProxyDownload("not-a-token", 1_001, "203.0.113.21", fetch, {
      range: null,
      inline: false,
      locale: "en",
    })
    expect(english.status).toBe(403)
    expect(await english.text()).toBe("This download link is not valid")
  })

  test("forwards a single byte range and lets the video element play inline", async () => {
    resetGuards()
    const captured = captureFetch(206)
    const token = await tokenFor({ Referer: "https://www.douyin.com/" })
    const response = await openProxyDownload(
      token,
      1_000,
      "203.0.113.12",
      captured.fetchImpl,
      { range: "bytes=0-", inline: true },
    )
    expect(response.status).toBe(206)
    expect(captured.range()).toBe("bytes=0-")
    expect(response.headers.get("content-range")).toBe("bytes 0-7/8")
    expect(response.headers.get("accept-ranges")).toBe("bytes")
    expect(response.headers.get("content-disposition")).toMatch(
      /^inline; filename="bilibili-\d+"$/,
    )
  })
})
