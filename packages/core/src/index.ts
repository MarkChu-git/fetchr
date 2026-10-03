import type { Effect } from "effect"

export const platforms = [
  "fixture",
  "youtube",
  "xiaohongshu",
  "douyin",
  "instagram",
  "tiktok",
  "kuaishou",
  "bilibili",
  "twitter",
] as const

export type Platform = (typeof platforms)[number]

export interface Author {
  readonly id?: string
  readonly name?: string
  readonly username?: string
  readonly avatar?: string
  readonly profileUrl?: string
}

export interface DirectDelivery {
  readonly type: "direct"
  readonly url: string
  readonly headers?: Readonly<Record<string, string>>
}

export interface ProxyDelivery {
  readonly type: "proxy"
  readonly token: string
  /**
   * Upstream URL before signing. The Worker must delete it after the token is signed. It must not appear in JSON the browser receives.
   * The browser cannot set Referer, so only the Worker may request this URL.
   */
  readonly upstreamUrl?: string
  /** Headers the Worker attaches. Do not put Cookie or Authorization here. */
  readonly upstreamHeaders?: Readonly<Record<string, string>>
}

/** Unsigned proxy handed up by a platform package. The token stays pending until the Worker signs it. */
export function unsignedProxy(
  url: string,
  headers?: Readonly<Record<string, string>>,
): ProxyDelivery {
  if (headers === undefined) {
    return { type: "proxy", token: "pending", upstreamUrl: url }
  }
  return {
    type: "proxy",
    token: "pending",
    upstreamUrl: url,
    upstreamHeaders: headers,
  }
}

export interface MediaSource {
  readonly url: string
  readonly headers?: Readonly<Record<string, string>>
}

export interface MuxDelivery {
  readonly type: "mux"
  readonly video: MediaSource
  readonly audio: MediaSource
  readonly outputContainer: "mp4" | "webm"
}

export interface PlaylistDelivery {
  readonly type: "playlist"
  readonly protocol: "hls" | "dash"
  readonly url: string
}

export type Delivery =
  | DirectDelivery
  | ProxyDelivery
  | MuxDelivery
  | PlaylistDelivery

interface AssetBase {
  readonly id: string
  readonly width?: number
  readonly height?: number
  readonly delivery: Delivery
}

export interface ImageAsset extends AssetBase {
  readonly type: "image"
}

export interface VideoAsset extends AssetBase {
  readonly type: "video"
  readonly fps?: number
  readonly codec?: string
  readonly container?: string
  readonly bitrate?: number
  /** Estimated file size, when the platform reports bitrate and duration. */
  readonly bytes?: number
  readonly thumbnail?: string
}

export interface AudioAsset {
  readonly type: "audio"
  readonly id: string
  readonly delivery: Delivery
}

export type MediaAsset = ImageAsset | VideoAsset | AudioAsset

export interface MediaPost {
  readonly platform: Platform
  readonly id: string
  readonly canonicalUrl: string
  readonly author?: Author
  readonly title?: string
  readonly description?: string
  readonly thumbnail?: string
  readonly publishedAt?: string
  readonly media: readonly MediaAsset[]
}

export interface CanonicalResource {
  readonly platform: Platform
  readonly id?: string
  readonly url: URL
}

export const extractErrorCodes = [
  "UNSUPPORTED_URL",
  "INVALID_URL",
  "RESOLVE_FAILED",
  "MEDIA_NOT_FOUND",
  "PAYLOAD_MISSING",
  "PRIVATE_MEDIA",
  "LOGIN_REQUIRED",
  "GEO_BLOCKED",
  "RATE_LIMITED",
  "SOURCE_UNAVAILABLE",
  "UPSTREAM_BLOCKED",
  "EXTRACTOR_BROKEN",
  "SCHEMA_CHANGED",
  "DRM_PROTECTED",
  "UPSTREAM_TIMEOUT",
] as const

export type ExtractErrorCode = (typeof extractErrorCodes)[number]

export interface ExtractFailure {
  readonly code: ExtractErrorCode
  readonly message: string
  /** Machine-readable cause for logs and tests. The page does not show this value. */
  readonly cause?: string
}

export interface Transport {
  readonly request: (
    input: Request,
  ) => Effect.Effect<Response, ExtractFailure>
}

export interface Extractor {
  readonly platform: Platform
  readonly match: (url: URL) => boolean
  readonly extract: (
    resource: CanonicalResource,
    transport: Transport,
  ) => Effect.Effect<MediaPost, ExtractFailure>
}

export interface ExtractorRegistry {
  readonly find: (url: URL) => Extractor | undefined
  readonly extract: (
    url: string,
    transport: Transport,
  ) => Effect.Effect<MediaPost, ExtractFailure>
}

export { extract } from "./extract"
export { detectUrls, type DetectedUrl } from "./input/detect-urls"
export { hostAllowed, hostMatches } from "./input/host"
export {
  followRedirects,
  resolveRedirects,
  type FollowedResponse,
  type RedirectPolicy,
} from "./network/redirects"
export { isBlockedHostname, isBlockedRequestTarget } from "./network/ssrf"
export { fixtureExtractor } from "@fetchr/fixture"
