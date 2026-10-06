import { expect, test, type APIRequestContext } from "@playwright/test"

const WECHAT_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50(0x18003237) NetType/WIFI Language/zh_CN"

const decode = (value: string): string =>
  value.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")

interface Meta {
  readonly key: string
  readonly content: string
}

/** Every `<meta>` that has a name or property and a content, in document order. */
function metas(html: string): Meta[] {
  const found: Meta[] = []
  for (const tag of html.matchAll(/<meta\b([^>]*)>/g)) {
    const attrs = new Map<string, string>()
    for (const attr of (tag[1] ?? "").matchAll(/([\w:-]+)="([^"]*)"/g)) attrs.set(attr[1] ?? "", decode(attr[2] ?? ""))
    const key = attrs.get("property") ?? attrs.get("name")
    const content = attrs.get("content")
    if (key !== undefined && content !== undefined) found.push({ key, content })
  }
  return found
}

const first = (tags: readonly Meta[], key: string): string | undefined => tags.find((tag) => tag.key === key)?.content
const titleOf = (html: string): string | undefined => {
  const raw = /<title>([^<]*)<\/title>/.exec(html)?.[1]
  return raw === undefined ? undefined : decode(raw)
}

async function page(request: APIRequestContext, path: string, headers?: Record<string, string>): Promise<{ html: string; tags: Meta[] }> {
  const response = await request.get(path, headers === undefined ? {} : { headers })
  expect(response.status(), path).toBe(200)
  const html = await response.text()
  return { html, tags: metas(html) }
}

async function pngSize(request: APIRequestContext, url: string): Promise<{ status: number; type: string; width: number; height: number }> {
  const response = await request.get(url)
  const body = await response.body()
  return {
    status: response.status(),
    type: response.headers()["content-type"] ?? "",
    width: body.readUInt32BE(16),
    height: body.readUInt32BE(20),
  }
}

test("the Chinese home page carries its title, tags and a share image that can be fetched", async ({ request, baseURL }) => {
  const { html, tags } = await page(request, "/")
  expect(titleOf(html)).toBe("Fetchr：粘贴链接，下载视频和图片")
  expect(first(tags, "og:title")).toBe("Fetchr：粘贴链接，下载视频和图片")
  expect(first(tags, "og:type")).toBe("website")
  expect(first(tags, "og:site_name")).toBe("Fetchr")
  expect(first(tags, "og:locale")).toBe("zh_CN")
  expect(first(tags, "og:url")).toBe(`${baseURL}/`)
  expect(first(tags, "twitter:card")).toBe("summary_large_image")
  expect(first(tags, "description")).toBe(first(tags, "og:description"))
  const image = first(tags, "og:image") ?? ""
  expect(image).toMatch(new RegExp(`^${baseURL}/share/og-zh\\.png\\?v=[0-9a-f]{8}$`))
  expect([first(tags, "og:image:width"), first(tags, "og:image:height"), first(tags, "og:image:type")]).toEqual(["1200", "630", "image/png"])
  expect(await pngSize(request, image)).toEqual({ status: 200, type: "image/png", width: 1200, height: 630 })
})

test("the English home page uses the English title, image and a url that keeps ?lang=en", async ({ request, baseURL }) => {
  const { html, tags } = await page(request, "/?lang=en")
  expect(titleOf(html)).toBe("Fetchr: paste a link, download videos and images")
  expect(first(tags, "og:locale")).toBe("en_US")
  expect(first(tags, "og:url")).toBe(`${baseURL}/?lang=en`)
  expect(first(tags, "og:image:alt")).toBe(
    "Fetchr's paste-link field and Extract button, supporting Xiaohongshu, Douyin, Instagram, Bilibili, YouTube and X",
  )
  const image = first(tags, "og:image") ?? ""
  expect(image).toMatch(/\/share\/og-en\.png\?v=[0-9a-f]{8}$/)
  expect(await pngSize(request, image)).toEqual({ status: 200, type: "image/png", width: 1200, height: 630 })
})

test("the terms page keeps the site title and carries its own path in og:url", async ({ request, baseURL }) => {
  const zh = await page(request, "/terms")
  expect(titleOf(zh.html)).toBe("Fetchr：粘贴链接，下载视频和图片")
  expect(first(zh.tags, "og:url")).toBe(`${baseURL}/terms`)
  const en = await page(request, "/terms?lang=en")
  expect(first(en.tags, "og:url")).toBe(`${baseURL}/terms?lang=en`)
})

test("no share tag appears twice", async ({ request }) => {
  const paths = ["/", "/?lang=en", "/terms"]
  const pages = await Promise.all(paths.map((path) => page(request, path)))
  pages.forEach(({ tags }, i) => {
    const seen = new Map<string, number>()
    for (const tag of tags) seen.set(tag.key, (seen.get(tag.key) ?? 0) + 1)
    for (const [key, count] of seen) expect(count, `${paths[i]} ${key}`).toBe(1)
  })
})

test("the head still links the favicon, the 32px icon and the apple touch icon", async ({ request }) => {
  const { html } = await page(request, "/")
  expect(html).toMatch(/<link[^>]+rel="icon"[^>]+href="\/favicon\.svg"/)
  expect(html).toMatch(/<link[^>]+rel="icon"[^>]+href="\/favicon-32\.png"/)
  expect(html).toMatch(/<link[^>]+rel="apple-touch-icon"[^>]+href="\/apple-touch-icon\.png"/)
})

test("the icons are served as PNG at the sizes the page claims", async ({ request }) => {
  expect(await pngSize(request, "/favicon-32.png")).toEqual({ status: 200, type: "image/png", width: 32, height: 32 })
  expect(await pngSize(request, "/apple-touch-icon.png")).toEqual({ status: 200, type: "image/png", width: 180, height: 180 })
})

test("inside WeChat the first element of the body is an off-screen 600x600 square image", async ({ request, baseURL }) => {
  const { html } = await page(request, "/", { "user-agent": WECHAT_UA })
  const body = /<body[^>]*>\s*(<img\b[^>]*>)/.exec(html)?.[1]
  expect(body, "the first element in <body> must be the square <img>").toBeDefined()
  const tag = body ?? ""
  expect(tag).toMatch(new RegExp(`src="${baseURL}/share/square\\.png\\?v=[0-9a-f]{8}"`))
  expect(tag).toMatch(/width="600"/)
  expect(tag).toMatch(/height="600"/)
  expect(tag).toMatch(/aria-hidden="true"/)
  expect(tag).toMatch(/alt=""/)
  expect(tag).toMatch(/position:\s*absolute/)
  expect(tag).toMatch(/left:\s*-9999px/)
  expect(tag).not.toMatch(/display:\s*none/)
  const src = /src="([^"]+)"/.exec(tag)?.[1] ?? ""
  expect(await pngSize(request, src)).toEqual({ status: 200, type: "image/png", width: 600, height: 600 })
})

test("outside WeChat the square image is not in the page at all", async ({ request }) => {
  const chrome = { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36" }
  const pages = await Promise.all([page(request, "/"), page(request, "/", chrome)])
  for (const { html } of pages) expect(html).not.toContain("square.png")
})

test("switching language in the browser does not ask the server for the share facts again", async ({ page: browser }) => {
  const serverCalls: string[] = []
  browser.on("request", (request) => {
    if (request.url().includes("_serverFn")) serverCalls.push(request.url())
  })
  await browser.goto("/")
  await browser.getByRole("button", { name: "EN" }).click()
  await expect(browser).toHaveURL(/lang=en/)
  await expect(browser.getByRole("button", { name: "Extract" })).toBeVisible()
  expect(serverCalls).toEqual([])
})
