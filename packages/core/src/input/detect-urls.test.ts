import { expect, test } from "bun:test"
import { detectUrls } from "./detect-urls"

function hrefs(input: string): readonly string[] {
  return detectUrls(input).map((detected) => detected.url.href)
}

test("reads a TikTok short link out of English share text", () => {
  expect(
    hrefs(
      "3.27 Copy and open TikTok to watch this video!\nhttps://vt.tiktok.com/ZSxxxxxxx/\n01/20 abc:/",
    ),
  ).toEqual(["https://vt.tiktok.com/ZSxxxxxxx/"])
})

test("reads a Douyin short link out of Chinese share text", () => {
  expect(
    hrefs("7.23 复制打开抖音，看看这个视频🔥\nhttps://v.douyin.com/ABC123/\n03/16 abc:/"),
  ).toEqual(["https://v.douyin.com/ABC123/"])
})

test("stops a URL before Chinese that is glued to it", () => {
  expect(
    hrefs("https://fixture.test/video/demo复制此链接，打开抖音搜索，直接观看视频！"),
  ).toEqual(["https://fixture.test/video/demo"])
})

test("ignores email, phone, mentions, and hashtags", () => {
  expect(hrefs("email me a@b.com or call (555) 010-0100 #tag @user")).toEqual([])
})

test("drops surrounding punctuation, emoji, and newlines", () => {
  expect(hrefs("🔥 Check this out\n(https://vt.tiktok.com/ZSxxxx/).\ncopied from TikTok")).toEqual([
    "https://vt.tiktok.com/ZSxxxx/",
  ])
  expect(hrefs("（https://www.tiktok.com/@user/photo/123，下一条）")).toEqual([
    "https://www.tiktok.com/@user/photo/123",
  ])
})

test("joins a URL that was split by invisible characters", () => {
  const input = `https://fixture.test/video/${String.fromCodePoint(0x200b, 0x200d)}demo`
  expect(hrefs(input)).toEqual(["https://fixture.test/video/demo"])
})

test("does not invent a scheme for a bare host", () => {
  expect(detectUrls("fixture.test/video/demo")).toEqual([])
  expect(detectUrls("not a url")).toEqual([])
})
