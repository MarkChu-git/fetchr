import { hostMatches } from "@fetchr/core"

/** Known entry hosts. `tiktok.com` also covers later subdomains such as regional web hosts. */
export const tiktokHosts = [
  "tiktok.com",
  "www.tiktok.com",
  "m.tiktok.com",
  "vm.tiktok.com",
  "vt.tiktok.com",
] as const

export type TikTokContentHint = "video" | "photo" | "short" | "unknown"

export function matchTikTokUrl(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false
  if (url.username.length > 0 || url.password.length > 0) return false
  return tiktokHosts.some((host) => hostMatches(url.hostname, host))
}

export function isTikTokShortLink(url: URL): boolean {
  const host = url.hostname.toLowerCase()
  if (host === "vm.tiktok.com" || host === "vt.tiktok.com") return true
  const [head, code, extra] = pathParts(url)
  return head === "t" && code !== undefined && extra === undefined
}

/** Path shape is read after redirects. Short links are still TikTok before they have a video id. */
export function tiktokContentHint(url: URL): TikTokContentHint {
  const [head, kind, id] = pathParts(url)
  if (head?.startsWith("@") && kind === "video" && id !== undefined) return "video"
  if (head?.startsWith("@") && kind === "photo" && id !== undefined) return "photo"
  if (isTikTokShortLink(url)) return "short"
  return "unknown"
}

function pathParts(url: URL): readonly string[] {
  return url.pathname.split("/").filter((part) => part.length > 0)
}
