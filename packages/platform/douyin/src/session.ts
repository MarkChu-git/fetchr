/**
 * A public work needs no login cookie.
 * The feed honors aweme_id only when the request carries the full client
 * parameter set. With aweme_id and aid alone it returns recommendations,
 * and notes never appear. The parameters below are what the app sends.
 * The app User-Agent stays because that client still receives a list. A browser User-Agent no longer empties it.
 */
const appUserAgent =
  "com.ss.android.ugc.aweme/320901 (Linux; U; Android 13; zh_CN; Pixel 7; Build/TD1A.220804.031; Cronet/58.0.2991.0)"

const feedHosts = [
  "https://api5-normal-c-hl.amemv.com/aweme/v1/feed/",
  "https://aweme.snssdk.com/aweme/v1/feed/",
] as const

const clientParams: Record<string, string> = {
  version_name: "32.9.0",
  version_code: "320901",
  device_platform: "android",
  os_version: "13",
  device_type: "Pixel 7",
  channel: "aweGW",
  os_api: "33",
  screen_width: "1080",
  screen_height: "2400",
  dpi: "420",
  app_language: "zh",
  locale: "zh-CN",
  resolution: "1080*2400",
  ac: "wifi",
  update_version_code: "32909900",
}

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
  for (const [key, value] of Object.entries(clientParams)) {
    url.searchParams.set(key, value)
  }
  return new Request(url, {
    headers: {
      accept: "application/json",
      "user-agent": appUserAgent,
    },
  })
}
