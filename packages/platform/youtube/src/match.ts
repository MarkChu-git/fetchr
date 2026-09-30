import { hostAllowed, hostMatches } from "@fetchr/core"

const videoIdPattern = /^[A-Za-z0-9_-]{11}$/

const watchHosts = [
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
] as const

export function isYoutubeVideoId(value: string): boolean {
  return videoIdPattern.test(value)
}

export function videoIdFromUrl(url: URL): string | undefined {
  if (hostMatches(url.hostname, "youtu.be")) {
    const id = url.pathname.split("/").find((segment) => segment.length > 0)
    return id !== undefined && isYoutubeVideoId(id) ? id : undefined
  }
  if (!hostAllowed(url.hostname, watchHosts) || url.pathname !== "/watch") return undefined
  const id = url.searchParams.get("v")
  return id !== null && isYoutubeVideoId(id) ? id : undefined
}

export function matchYoutubeUrl(url: URL): boolean {
  return videoIdFromUrl(url) !== undefined
}
