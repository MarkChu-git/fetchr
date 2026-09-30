/**
 * A public video needs no login cookie.
 * The mobile feed used to return the requested work. It now ignores aweme_id and returns other recommendations.
 * Web detail from a Worker answers 403, body "Blocked by ArgusSecurityPlugin Uifid Not Found". Do not sign that request.
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

/**
 * Image notes are not in the public video feed.
 * slidesinfo returns this note's aweme_details only when request_source=200. No login is required.
 * The first try omits the app identifier, and the Worker fills in a browser identifier. On refusal or an empty list, the second try asks the same public API with the app identifier.
 */
export function slidesRequest(id: string, attempt: 0 | 1 = 0): Request {
  const url = new URL("https://www.iesdouyin.com/web/api/v2/aweme/slidesinfo/")
  url.searchParams.set("aweme_ids", `[${id}]`)
  url.searchParams.set("request_source", "200")
  const headers = new Headers({
    accept: "application/json",
    referer: "https://www.iesdouyin.com/",
  })
  if (attempt === 1) headers.set("user-agent", appUserAgent)
  return new Request(url, { headers })
}
