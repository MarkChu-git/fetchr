const videoHosts = new Set([
  "www.bilibili.com",
  "bilibili.com",
  "m.bilibili.com",
])

const shortHosts = new Set(["b23.tv", "www.b23.tv"])

const bvidText = /^BV[0-9A-Za-z]{10}$/
const bvidPath = /^\/video\/(BV[0-9A-Za-z]{10})\/?$/
const shortPath = /^\/[0-9A-Za-z]+\/?$/

export function isBvid(value: string): boolean {
  return bvidText.test(value)
}

export function bvidFromUrl(url: URL): string | undefined {
  if (url.protocol !== "https:") return undefined
  if (!videoHosts.has(url.hostname)) return undefined
  return bvidPath.exec(url.pathname)?.[1]
}

export function matchBilibiliUrl(url: URL): boolean {
  if (url.protocol !== "https:") return false
  if (bvidFromUrl(url) !== undefined) return true
  return shortHosts.has(url.hostname) && shortPath.test(url.pathname)
}
