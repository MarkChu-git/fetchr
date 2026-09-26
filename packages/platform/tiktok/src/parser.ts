import type { ExtractFailure, MediaPost, VideoAsset } from "@fetchr/core"
import type { TikTokPage } from "./schema"

const rehydrationId = "__UNIVERSAL_DATA_FOR_REHYDRATION__"
// 10216 is a private post. 10222 is a private account. Neither returns media.
const privateStatusCodes = new Set([10216, 10222])

export const readRehydrationJson = (page: string): string | undefined => {
  const scripts = page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)
  for (const script of scripts) {
    const attrs = script[1]
    const body = script[2]
    if (attrs === undefined || body === undefined) continue
    const id = /\bid\s*=\s*(["'])([^"']+)\1/i.exec(attrs)
    if (id?.[2] !== rehydrationId) continue
    const json = body.trim()
    if (json.length > 0) return json
  }
  return undefined
}

export const mediaPostFromTikTokPage = (
  page: TikTokPage,
  canonicalUrl: string,
): { readonly post: MediaPost } | { readonly failure: ExtractFailure } => {
  const detail = page.__DEFAULT_SCOPE__["webapp.video-detail"]
  if (privateStatusCodes.has(detail.statusCode)) {
    return {
      failure: {
        code: "PRIVATE_MEDIA",
        message: "TikTok post is private",
      },
    }
  }

  const item = detail.itemInfo?.itemStruct
  if (detail.statusCode !== 0 || item === undefined) {
    return {
      failure: {
        code: "MEDIA_NOT_FOUND",
        message: `TikTok video is unavailable (status ${detail.statusCode})`,
      },
    }
  }
  const cover = item.video.cover
  // TikTok's CDN requires a Referer the browser cannot set. Signing stays in the Worker.
  const video: VideoAsset = {
    type: "video",
    id: item.id,
    delivery: { type: "proxy", token: "pending" },
    ...(cover !== undefined ? { thumbnail: cover } : {}),
    ...(item.video.width !== undefined ? { width: item.video.width } : {}),
    ...(item.video.height !== undefined ? { height: item.video.height } : {}),
  }

  const post: MediaPost = {
    platform: "tiktok",
    id: item.id,
    canonicalUrl,
    author: {
      id: item.author.id,
      name: item.author.nickname,
      username: item.author.uniqueId,
      ...(item.author.avatarThumb !== undefined
        ? { avatar: item.author.avatarThumb }
        : {}),
    },
    description: item.desc,
    ...(cover !== undefined ? { thumbnail: cover } : {}),
    media: [video],
  }
  return { post }
}
