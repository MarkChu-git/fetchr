import { expect, test } from "bun:test"
import { pageCopy, type Locale } from "./i18n"
import { shareAssets } from "./share-assets.gen"
import { isWeChatUserAgent, readRequestFacts, shareMeta, squareImageSrc, type MetaTag } from "./share-meta"

const ORIGIN = "https://fetchr.hanyang.app"

const metaFor = (locale: Locale, pathname = "/", origin: string | null = ORIGIN): MetaTag[] =>
  shareMeta({ locale, copy: pageCopy(locale), origin, pathname, images: shareAssets })

/** The value of the first tag with this `name` or `property`. */
function valueOf(tags: readonly MetaTag[], key: string): string | undefined {
  for (const tag of tags) {
    if ("name" in tag && tag.name === key) return tag.content
    if ("property" in tag && tag.property === key) return tag.content
  }
  return undefined
}

const titleOf = (tags: readonly MetaTag[]): string | undefined => tags.flatMap((tag) => ("title" in tag ? [tag.title] : []))[0]

const keyOf = (tag: MetaTag): string => {
  if ("title" in tag) return "title"
  return "name" in tag ? `name:${tag.name}` : `property:${tag.property}`
}

test("the Chinese home page gets the approved title, description, Open Graph and Twitter tags", () => {
  const tags = metaFor("zh")
  const copy = pageCopy("zh")
  expect(titleOf(tags)).toBe("Fetchr：粘贴链接，下载视频和图片")
  expect(valueOf(tags, "description")).toBe(copy.description)
  expect(valueOf(tags, "og:type")).toBe("website")
  expect(valueOf(tags, "og:site_name")).toBe("Fetchr")
  expect(valueOf(tags, "og:title")).toBe(titleOf(tags))
  expect(valueOf(tags, "og:description")).toBe(copy.description)
  expect(valueOf(tags, "og:locale")).toBe("zh_CN")
  expect(valueOf(tags, "og:url")).toBe(`${ORIGIN}/`)
  expect(valueOf(tags, "og:image")).toBe(`${ORIGIN}/share/og-zh.png?v=${shareAssets.ogZh.version}`)
  expect(valueOf(tags, "og:image:type")).toBe("image/png")
  expect(valueOf(tags, "og:image:width")).toBe("1200")
  expect(valueOf(tags, "og:image:height")).toBe("630")
  expect(valueOf(tags, "og:image:alt")).toBe(copy.shareImageAlt)
  expect(valueOf(tags, "twitter:card")).toBe("summary_large_image")
})

test("the English home page uses the English title, locale, image and a url that keeps ?lang=en", () => {
  const tags = metaFor("en")
  expect(titleOf(tags)).toBe("Fetchr: paste a link, download videos and images")
  expect(valueOf(tags, "og:locale")).toBe("en_US")
  expect(valueOf(tags, "og:url")).toBe(`${ORIGIN}/?lang=en`)
  expect(valueOf(tags, "og:image")).toBe(`${ORIGIN}/share/og-en.png?v=${shareAssets.ogEn.version}`)
  expect(valueOf(tags, "og:image:alt")).toBe(pageCopy("en").shareImageAlt)
})

test("the terms page keeps the site title and carries its own path in og:url", () => {
  expect(titleOf(metaFor("zh", "/terms"))).toBe(titleOf(metaFor("zh")))
  expect(valueOf(metaFor("zh", "/terms"), "og:url")).toBe(`${ORIGIN}/terms`)
  expect(valueOf(metaFor("en", "/terms"), "og:url")).toBe(`${ORIGIN}/terms?lang=en`)
})

test("without an origin the image and url tags are left out and everything else stays", () => {
  for (const locale of ["zh", "en"] as const) {
    const tags = metaFor(locale, "/", null)
    for (const key of ["og:url", "og:image", "og:image:type", "og:image:width", "og:image:height", "og:image:alt"]) {
      expect(valueOf(tags, key), `${locale} must not carry ${key}`).toBeUndefined()
    }
    for (const key of ["description", "og:type", "og:site_name", "og:title", "og:description", "og:locale", "twitter:card"]) {
      expect(valueOf(tags, key), `${locale} keeps ${key}`).toBeDefined()
    }
    expect(titleOf(tags)).toBe(pageCopy(locale).title)
  }
})

test("every url is absolute and starts with the request's origin", () => {
  for (const locale of ["zh", "en"] as const) {
    for (const path of ["/", "/terms"]) {
      const tags = metaFor(locale, path)
      expect(valueOf(tags, "og:url")?.startsWith(`${ORIGIN}/`)).toBe(true)
      expect(valueOf(tags, "og:image")?.startsWith(`${ORIGIN}/share/`)).toBe(true)
    }
  }
  expect(valueOf(metaFor("zh", "/", "http://127.0.0.1:4173"), "og:image")).toStartWith("http://127.0.0.1:4173/share/")
})

test("no tag name or property appears twice", () => {
  for (const origin of [ORIGIN, null]) {
    for (const locale of ["zh", "en"] as const) {
      const keys = metaFor(locale, "/", origin).map(keyOf)
      expect(new Set(keys).size, `${locale}/${origin}: ${keys.join(", ")}`).toBe(keys.length)
    }
  }
})

test("WeChat's own browsers are recognised and others are not", () => {
  const wechat = [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50(0x18003237) NetType/WIFI Language/zh_CN",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.113 Mobile Safari/537.36 XWEB/1220099 MMWEBSDK/20240404 MMWEBID/2315 MicroMessenger/8.0.49.2600(0x2800315F) WeChat/arm64 Weixin NetType/WIFI Language/zh_CN ABI/arm64",
    "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36 MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI WindowsWechat(0x6309080f)",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) MicroMessenger/6.8.0(0x16080000) MacWechat/3.8.7(0x13080710) NetType/WIFI WindowsWechat",
  ]
  const others = [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Linux; U; Android 13; zh-cn; M2102K1AC Build/TKQ1.220829.002) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/89.0.4389.116 MQQBrowser/13.9 Mobile Safari/537.36 COVC/046011",
    "Twitterbot/1.0",
    "",
  ]
  for (const ua of wechat) expect(isWeChatUserAgent(ua), ua).toBe(true)
  for (const ua of others) expect(isWeChatUserAgent(ua), ua).toBe(false)
  expect(isWeChatUserAgent(null)).toBe(false)
  expect(isWeChatUserAgent(undefined)).toBe(false)
})

test("the square image address carries the content hash, and is null without an origin", () => {
  expect(squareImageSrc(ORIGIN, shareAssets)).toBe(`${ORIGIN}/share/square.png?v=${shareAssets.square.version}`)
  expect(squareImageSrc(null, shareAssets)).toBeNull()
})

test("request facts that cannot be read fall back to no origin and not WeChat, and the page still gets its tags", () => {
  const unreadable = readRequestFacts(() => {
    throw new Error("there is no request here")
  })
  expect(unreadable).toEqual({ origin: null, wechat: false })
  const tags = shareMeta({ locale: "zh", copy: pageCopy("zh"), origin: unreadable.origin, pathname: "/", images: shareAssets })
  expect(titleOf(tags)).toBe(pageCopy("zh").title)
  expect(valueOf(tags, "og:image")).toBeUndefined()
  expect(squareImageSrc(unreadable.origin, shareAssets)).toBeNull()
})

test("request facts that can be read are passed through untouched", () => {
  expect(readRequestFacts(() => ({ origin: ORIGIN, wechat: true }))).toEqual({ origin: ORIGIN, wechat: true })
})
