import { expect, test } from "bun:test"
import { pageCopy, type Locale } from "./i18n"
import { shareAssets } from "./share-assets.gen"
import { isLinkPreviewCrawler, readRequestFacts, shareMeta, type MetaTag } from "./share-meta"

const ORIGIN = "https://fetchr.hanyang.app"

/** The tags a known link-preview crawler gets, unless `crawler` says otherwise. */
const metaFor = (locale: Locale, pathname = "/", origin: string | null = ORIGIN, crawler = true): MetaTag[] =>
  shareMeta({ locale, copy: pageCopy(locale), origin, crawler, pathname, images: shareAssets })

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

test("anyone who is not a known crawler, WeChat's link fetcher included, gets the square image and a summary card", () => {
  for (const locale of ["zh", "en"] as const) {
    const tags = metaFor(locale, "/", ORIGIN, false)
    expect(valueOf(tags, "og:image"), `${locale} image`).toBe(`${ORIGIN}/share/square.png?v=${shareAssets.square.version}`)
    expect(valueOf(tags, "og:image:type"), `${locale} type`).toBe("image/png")
    expect(valueOf(tags, "og:image:width"), `${locale} width`).toBe("600")
    expect(valueOf(tags, "og:image:height"), `${locale} height`).toBe("600")
    expect(valueOf(tags, "og:image:alt"), `${locale} alt`).toBe("Fetchr")
    expect(valueOf(tags, "twitter:card"), `${locale} card`).toBe("summary")
  }
})

test("a crawler and anyone else differ only in the image tags and the card type", () => {
  const picture = new Set(["property:og:image", "property:og:image:width", "property:og:image:height", "property:og:image:alt", "name:twitter:card"])
  const withoutPicture = (tags: readonly MetaTag[]): MetaTag[] => tags.filter((tag) => !picture.has(keyOf(tag)))
  for (const locale of ["zh", "en"] as const) {
    expect(withoutPicture(metaFor(locale, "/", ORIGIN, false)), locale).toEqual(withoutPicture(metaFor(locale)))
  }
})

test("the terms page keeps the site title and carries its own path in og:url", () => {
  expect(titleOf(metaFor("zh", "/terms"))).toBe(titleOf(metaFor("zh")))
  expect(valueOf(metaFor("zh", "/terms"), "og:url")).toBe(`${ORIGIN}/terms`)
  expect(valueOf(metaFor("en", "/terms"), "og:url")).toBe(`${ORIGIN}/terms?lang=en`)
})

test("without an origin the image and url tags are left out and everything else stays", () => {
  for (const crawler of [true, false]) {
    for (const locale of ["zh", "en"] as const) {
      const tags = metaFor(locale, "/", null, crawler)
      for (const key of ["og:url", "og:image", "og:image:type", "og:image:width", "og:image:height", "og:image:alt"]) {
        expect(valueOf(tags, key), `${locale}/${crawler} must not carry ${key}`).toBeUndefined()
      }
      for (const key of ["description", "og:type", "og:site_name", "og:title", "og:description", "og:locale", "twitter:card"]) {
        expect(valueOf(tags, key), `${locale}/${crawler} keeps ${key}`).toBeDefined()
      }
      expect(titleOf(tags)).toBe(pageCopy(locale).title)
    }
  }
})

test("every url is absolute and starts with the request's origin", () => {
  for (const crawler of [true, false]) {
    for (const locale of ["zh", "en"] as const) {
      for (const path of ["/", "/terms"]) {
        const tags = metaFor(locale, path, ORIGIN, crawler)
        expect(valueOf(tags, "og:url")?.startsWith(`${ORIGIN}/`)).toBe(true)
        expect(valueOf(tags, "og:image")?.startsWith(`${ORIGIN}/share/`)).toBe(true)
      }
    }
  }
  expect(valueOf(metaFor("zh", "/", "http://127.0.0.1:4173"), "og:image")).toStartWith("http://127.0.0.1:4173/share/")
  expect(valueOf(metaFor("zh", "/", "http://127.0.0.1:4173", false), "og:image")).toStartWith("http://127.0.0.1:4173/share/")
})

test("no tag name or property appears twice", () => {
  for (const origin of [ORIGIN, null]) {
    for (const crawler of [true, false]) {
      for (const locale of ["zh", "en"] as const) {
        const keys = metaFor(locale, "/", origin, crawler).map(keyOf)
        expect(new Set(keys).size, `${locale}/${origin}/${crawler}: ${keys.join(", ")}`).toBe(keys.length)
      }
    }
  }
})

test("request facts that cannot be read fall back to no origin and no crawler, and the page still gets its tags", () => {
  const unreadable = readRequestFacts(() => {
    throw new Error("there is no request here")
  })
  expect(unreadable).toEqual({ origin: null, crawler: false })
  const tags = shareMeta({ locale: "zh", copy: pageCopy("zh"), pathname: "/", images: shareAssets, ...unreadable })
  expect(titleOf(tags)).toBe(pageCopy("zh").title)
  expect(valueOf(tags, "og:image")).toBeUndefined()
})

test("request facts that can be read are passed through untouched", () => {
  expect(readRequestFacts(() => ({ origin: ORIGIN, crawler: true }))).toEqual({ origin: ORIGIN, crawler: true })
  expect(readRequestFacts(() => ({ origin: ORIGIN, crawler: false }))).toEqual({ origin: ORIGIN, crawler: false })
})

const CRAWLERS = [
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "Twitterbot/1.0",
  "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  "TelegramBot (like TwitterBot)",
  "WhatsApp/2.23.20.0 A",
  "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
  "LinkedInBot/1.0 (compatible; Mozilla/5.0; Jakarta Commons-HttpClient/3.1 +http://www.linkedin.com)",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/600.2.5 (KHTML, like Gecko) Version/8.0.2 Safari/600.2.5 (Applebot/0.1; +http://www.apple.com/go/applebot)",
  // Apple Messages is reported to send an old Safari string with the Facebook and X crawlers' names appended.
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0",
]

/** Every name the list is meant to recognise. Drop one from the list and its case below goes red. */
const CRAWLER_NAMES = ["facebookexternalhit", "facebot", "twitterbot", "slackbot", "telegrambot", "whatsapp", "discordbot", "linkedinbot", "applebot"]

const NOT_CRAWLERS = [
  // Other crawlers and clients that are not on the list: they get the square.
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  "curl/8.7.1",
  "Python-urllib/3.14",
  // WeChat's in-app browser. No user agent is documented for its link fetcher, so that lands here as well.
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50(0x18003231) NetType/WIFI Language/zh_CN",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 XWEB/1220133 MMWEBSDK/20240404 MicroMessenger/8.0.49",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
]

test("the crawlers that draw wide link cards are recognised by their user agent", () => {
  for (const userAgent of CRAWLERS) expect(isLinkPreviewCrawler(userAgent), userAgent).toBe(true)
})

test("each listed crawler name is recognised on its own, in any letter case", () => {
  for (const name of CRAWLER_NAMES) {
    for (const userAgent of [`${name}/1.0`, `Mozilla/5.0 (compatible; ${name.toUpperCase()}/2.0)`]) {
      expect(isLinkPreviewCrawler(userAgent), userAgent).toBe(true)
    }
  }
})

test("other crawlers, browsers, WeChat and a missing user agent are not link-preview crawlers", () => {
  for (const userAgent of NOT_CRAWLERS) expect(isLinkPreviewCrawler(userAgent), userAgent).toBe(false)
  for (const missing of [null, undefined, ""]) expect(isLinkPreviewCrawler(missing), String(missing)).toBe(false)
})
