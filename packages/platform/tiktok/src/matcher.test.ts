import { expect, test } from "bun:test"
import { detectUrls } from "@fetchr/core"
import { isTikTokShortLink, matchTikTokUrl, tiktokContentHint } from "./matcher"

const samples = [
  "https://vm.tiktok.com/ZSxxxx/",
  "https://vt.tiktok.com/ZSxxxx/",
  "https://m.tiktok.com/@user/video/123",
  "https://www.tiktok.com/@user/video/123",
  "https://www.tiktok.com/@user/photo/123",
  "https://tiktok.com/t/ZSxxxx/",
  "http://VM.tiktok.com/abc",
]

test("recognizes TikTok hosts without requiring a canonical video path", () => {
  for (const sample of samples) {
    expect(matchTikTokUrl(new URL(sample))).toBe(true)
  }
  expect(matchTikTokUrl(new URL("https://www.tiktok.com/"))).toBe(true)
  expect(matchTikTokUrl(new URL("https://www.douyin.com/video/1"))).toBe(false)
  expect(matchTikTokUrl(new URL("https://nottiktok.com/@user/video/1"))).toBe(false)
  expect(matchTikTokUrl(new URL("javascript://tiktok.com/alert"))).toBe(false)
})

test("share text reaches the TikTok host check through the shared input layer", () => {
  const detected = detectUrls("🔥 Check this out\nhttps://vt.tiktok.com/ZSxxxx/\ncopied from TikTok")
  const url = detected[0]?.url
  expect(url).toBeDefined()
  if (url === undefined) return
  expect(matchTikTokUrl(url)).toBe(true)
  expect(isTikTokShortLink(url)).toBe(true)
  expect(tiktokContentHint(url)).toBe("short")
})

test("classifies video, photo, and short paths after the host is known", () => {
  expect(tiktokContentHint(new URL("https://www.tiktok.com/@user/video/123"))).toBe("video")
  expect(tiktokContentHint(new URL("https://www.tiktok.com/@user/photo/123"))).toBe("photo")
  expect(tiktokContentHint(new URL("https://www.tiktok.com/t/ZSxxxx"))).toBe("short")
  expect(isTikTokShortLink(new URL("https://www.tiktok.com/@user/video/123"))).toBe(false)
})
