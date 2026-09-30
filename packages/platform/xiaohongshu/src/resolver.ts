import { hostAllowed, type CanonicalResource } from "@fetchr/core"

const exploreHosts = ["www.xiaohongshu.com", "xiaohongshu.com"] as const
const shortHosts = ["xhslink.com", "www.xhslink.com"] as const

const explorePath = /^\/explore\/([A-Za-z0-9]+)\/?$/
const shortPath = /^\/[A-Za-z0-9]+(?:\/[A-Za-z0-9]+)*\/?$/
const exploreInText = /https:\/\/(?:www\.)?xiaohongshu\.com\/explore\/([A-Za-z0-9]+)\/?/

export const canonicalExploreUrl = (id: string): URL =>
  new URL(`https://www.xiaohongshu.com/explore/${id}`)

export const exploreId = (url: URL): string | undefined => {
  if (url.protocol !== "https:" || !hostAllowed(url.hostname, exploreHosts)) return undefined
  return explorePath.exec(url.pathname)?.[1]
}

export const isShortLink = (url: URL): boolean =>
  url.protocol === "https:" &&
  hostAllowed(url.hostname, shortHosts) &&
  shortPath.test(url.pathname)

export const match = (url: URL): boolean => {
  if (url.protocol !== "https:") return false
  if (hostAllowed(url.hostname, exploreHosts)) return explorePath.test(url.pathname)
  return isShortLink(url)
}

export const resolveShortLink = (htmlOrLocation: string): CanonicalResource => {
  const id = exploreInText.exec(htmlOrLocation)?.[1]
  if (id === undefined || id.length === 0) {
    throw new Error("The link did not resolve to an explore URL.")
  }
  return {
    platform: "xiaohongshu",
    id,
    url: canonicalExploreUrl(id),
  }
}
