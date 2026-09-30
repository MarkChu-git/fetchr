import { describe, expect, test } from "bun:test"
import type { MediaPost } from "@fetchr/core"
import { verify } from "@fetchr/delivery"
import { sealPost } from "./seal"

const secret = "test-secret"

describe("sealPost", () => {
  test("replaces the upstream url with a token the browser can open", async () => {
    const post: MediaPost = {
      platform: "xiaohongshu",
      id: "abc",
      canonicalUrl: "https://www.xiaohongshu.com/explore/abc",
      media: [
        {
          type: "image",
          id: "abc-1",
          delivery: {
            type: "proxy",
            token: "pending",
            upstreamUrl: "https://cdn.example/a.jpg",
            upstreamHeaders: { Referer: "https://www.xiaohongshu.com/" },
          },
        },
      ],
    }
    const sealed = await sealPost(post, secret, 1_000)
    const delivery = sealed.media[0]?.delivery
    expect(delivery?.type).toBe("proxy")
    if (delivery?.type !== "proxy") return
    expect(delivery.upstreamUrl).toBeUndefined()
    expect(JSON.stringify(sealed)).not.toContain("cdn.example")
    const claims = await verify({ token: delivery.token, now: 1_000, secret })
    expect(claims.url).toBe("https://cdn.example/a.jpg")
    expect(claims.headers.Referer).toBe("https://www.xiaohongshu.com/")
  })

  test("seals mux sources that need a referer into same-origin downloads", async () => {
    const post: MediaPost = {
      platform: "bilibili",
      id: "BV1",
      canonicalUrl: "https://www.bilibili.com/video/BV1",
      media: [
        {
          type: "video",
          id: "BV1",
          delivery: {
            type: "mux",
            outputContainer: "mp4",
            video: {
              url: "https://cdn.example/video.m4s",
              headers: { Referer: "https://www.bilibili.com/" },
            },
            audio: {
              url: "https://cdn.example/audio.m4s",
              headers: { Referer: "https://www.bilibili.com/" },
            },
          },
        },
      ],
    }
    const sealed = await sealPost(post, secret, 1_000)
    const delivery = sealed.media[0]?.delivery
    expect(delivery?.type).toBe("mux")
    if (delivery?.type !== "mux") return
    expect(delivery.video.url.startsWith("/download/")).toBe(true)
    expect(delivery.audio.url.startsWith("/download/")).toBe(true)
    const json = JSON.stringify(delivery)
    expect(json).not.toContain("cdn.example")
    expect(json).not.toContain("Referer")
  })
})
