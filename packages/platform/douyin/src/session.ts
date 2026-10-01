/**
 * A public video needs no login cookie.
 * The public feed answers without a signature and stays the fast path for videos.
 * The web detail endpoint rejects unsigned requests; signed calls live in detail.ts.
 * The app User-Agent stays because that client still receives a list. A browser User-Agent no longer empties it.
 */
const appUserAgent =
  "com.ss.android.ugc.aweme/320901 (Linux; U; Android 13; zh_CN; Pixel 7; Build/TD1A.220804.031; Cronet/58.0.2991.0)"

const feedHosts = [
  "https://api5-normal-c-hl.amemv.com/aweme/v1/feed/",
  "https://aweme.snssdk.com/aweme/v1/feed/",
] as const

const videoIdPattern = /^[A-Za-z0-9]+$/

function playEndpoint(videoId: string | undefined, ratio: string): string | undefined {
  if (videoId === undefined || !videoIdPattern.test(videoId)) return undefined
  const url = new URL("https://aweme.snssdk.com/aweme/v1/play/")
  url.searchParams.set("video_id", videoId)
  url.searchParams.set("ratio", ratio)
  url.searchParams.set("line", "0")
  return url.toString()
}

/**
 * The play URL returned directly in the feed is often 540p.
 * Asking the public play endpoint for ratio 1080p, 1440p, or 2160p still returns H.264 at no more than 1920×1080.
 * ratio=default is the original file without a watermark. Quality follows the work. Do not hardcode a resolution here.
 */
export function highDefinitionPlayUrl(videoId: string | undefined): string | undefined {
  return playEndpoint(videoId, "default")
}

/**
 * The original file is often HEVC. A browser that cannot decode HEVC does not report an error, and videoWidth stays 0.
 * This H.264 URL is only a picture fallback. Download still uses highDefinitionPlayUrl.
 */
export function browserPlayUrl(videoId: string | undefined): string | undefined {
  return playEndpoint(videoId, "1080p")
}

export function feedRequest(id: string, attempt: 0 | 1): Request {
  const base = feedHosts[attempt]
  const url = new URL(base)
  url.searchParams.set("aweme_id", id)
  url.searchParams.set("aid", "1128")
  return new Request(url, {
    headers: {
      accept: "application/json",
      "user-agent": appUserAgent,
    },
  })
}
