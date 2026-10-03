import { hostAllowed, type CanonicalResource } from "@fetchr/core"

const noteHosts = ["www.xiaohongshu.com", "xiaohongshu.com"] as const
const shortHosts = ["xhslink.com", "www.xhslink.com", "xhslink.cn", "www.xhslink.cn"] as const

const notePath = /^\/(?:explore|search_result)\/([A-Za-z0-9]+)\/?$/
const discoveryPath = /^\/discovery\/item\/([A-Za-z0-9]+)\/?$/
const shortPath = /^\/[A-Za-z0-9]+(?:\/[A-Za-z0-9]+)*\/?$/
const noteUrlInText =
  /https:\/\/(?:www\.)?xiaohongshu\.com\/(?:explore|search_result|discovery\/item)\/[A-Za-z0-9]+[^\s"'<]*/

const httpOrHttps = (url: URL): boolean =>
  url.protocol === "https:" || url.protocol === "http:"

/**
 * The note id lives in three public path shapes: /explore/<id>, /discovery/item/<id>,
 * and /search_result/<id>. A share redirect always lands on one of them.
 */
export const noteId = (url: URL): string | undefined => {
  if (!hostAllowed(url.hostname, noteHosts)) return undefined
  return notePath.exec(url.pathname)?.[1] ?? discoveryPath.exec(url.pathname)?.[1]
}

export const isShortLink = (url: URL): boolean =>
  httpOrHttps(url) && hostAllowed(url.hostname, shortHosts) && shortPath.test(url.pathname)

export const match = (url: URL): boolean => {
  if (!httpOrHttps(url)) return false
  if (hostAllowed(url.hostname, noteHosts)) return noteId(url) !== undefined
  return isShortLink(url)
}

/** Shared copies arrive as http://. Upgrade before the first request so the page fetch stays on https. */
export const asHttps = (url: URL): URL => {
  if (url.protocol === "https:") return url
  const upgraded = new URL(url.href)
  upgraded.protocol = "https:"
  return upgraded
}

/**
 * The mobile share render lives at /discovery/item/<id>. It serves the note
 * anonymously when the URL keeps xsec_token; /explore and /search_result
 * bounce a phone client here anyway, so requests canonicalize to it directly.
 */
export const sharePageUrl = (id: string, source: URL): URL => {
  const url = new URL(`https://www.xiaohongshu.com/discovery/item/${id}`)
  url.search = source.search
  return url
}

const resourceFrom = (url: URL): CanonicalResource | undefined => {
  const id = noteId(url)
  if (id === undefined) return undefined
  // The query carries xsec_token. Without it Xiaohongshu answers the security page,
  // so the resolved resource keeps the redirect target intact.
  return { platform: "xiaohongshu", id, url }
}

/**
 * xhslink answers a 302 whose Location is the full note URL with xsec_token.
 * A bare id is not enough — the token must survive into the page request.
 */
export const resolveShortLink = (htmlOrLocation: string): CanonicalResource => {
  try {
    const direct = resourceFrom(new URL(htmlOrLocation.trim()))
    if (direct !== undefined) return direct
  } catch {
    // Not a bare URL. The payload is an HTML body; find the target inside it.
  }
  const found = noteUrlInText.exec(htmlOrLocation)?.[0]
  if (found === undefined) {
    throw new Error("The link did not resolve to a Xiaohongshu note URL.")
  }
  const resource = resourceFrom(new URL(found))
  if (resource === undefined) {
    throw new Error("The link did not resolve to a Xiaohongshu note URL.")
  }
  return resource
}
