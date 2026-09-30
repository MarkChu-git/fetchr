const videoIdPattern = /^[A-Za-z0-9_-]{11}$/

const watchHosts = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
])

export function isYoutubeVideoId(value: string): boolean {
  return videoIdPattern.test(value)
}

export function videoIdFromUrl(url: URL): string | undefined {
  const host = url.hostname.toLowerCase()
  if (host === "youtu.be") {
    const id = url.pathname.split("/").find((segment) => segment.length > 0)
    return id !== undefined && isYoutubeVideoId(id) ? id : undefined
  }
  if (!watchHosts.has(host) || url.pathname !== "/watch") return undefined
  const id = url.searchParams.get("v")
  return id !== null && isYoutubeVideoId(id) ? id : undefined
}

export function matchYoutubeUrl(url: URL): boolean {
  return videoIdFromUrl(url) !== undefined
}
