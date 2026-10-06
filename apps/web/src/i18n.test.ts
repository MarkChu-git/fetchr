import { expect, test } from "bun:test"
import { htmlLang, localeFromCookie, localeFromSearch, pageCopy } from "./i18n"

test("locale search and cookie accept only Chinese and English", () => {
  expect(localeFromSearch("en")).toBe("en")
  expect(localeFromSearch("zh")).toBe("zh")
  expect(localeFromSearch("fr")).toBe("zh")
  expect(localeFromSearch(null)).toBe("zh")
  expect(localeFromCookie(null)).toBe("zh")
  expect(localeFromCookie("fetchr_locale=en")).toBe("en")
  expect(localeFromCookie("other=1; fetchr_locale=zh")).toBe("zh")
  expect(localeFromCookie("fetchr_locale=english")).toBe("zh")
  expect(htmlLang("en")).toBe("en")
  expect(htmlLang("zh")).toBe("zh-CN")
})

test("the page title names the product and what it does, per locale", () => {
  expect(pageCopy("zh").title).toBe("Fetchr：粘贴链接，下载视频和图片")
  expect(pageCopy("en").title).toBe("Fetchr: paste a link, download videos and images")
})

test("the share headline is the card's big line, per locale", () => {
  expect(pageCopy("zh").shareHeadline).toBe("粘贴链接，下载视频和图片")
  expect(pageCopy("en").shareHeadline).toBe("Paste a link, save the media")
})

test("the share image description is given per locale and names every listed platform", () => {
  expect(pageCopy("zh").shareImageAlt).toBe(
    "Fetchr 的粘贴链接输入框与解析按钮，支持小红书、抖音、Instagram、哔哩哔哩、YouTube 和 X",
  )
  expect(pageCopy("en").shareImageAlt).toBe(
    "Fetchr's paste-link field and Extract button, supporting Xiaohongshu, Douyin, Instagram, Bilibili, YouTube and X",
  )
  for (const locale of ["zh", "en"] as const) {
    const copy = pageCopy(locale)
    for (const name of copy.platforms) {
      expect(copy.shareImageAlt, `${locale}.shareImageAlt must mention ${name}`).toContain(name)
    }
  }
})
