import type { ExtractErrorCode, ExtractFailure } from "@fetchr/core"

/**
 * Platform codes stay in this package. Core only receives a shared code.
 * `cause` keeps the platform code for logs and tests.
 */
const tiktokErrorCodes = [
  "UNSUPPORTED_URL",
  "SHORT_LINK_RESOLVE_FAILED",
  "UPSTREAM_FETCH_FAILED",
  "UPSTREAM_BLOCKED",
  "REHYDRATION_NOT_FOUND",
  "REHYDRATION_EMPTY",
  "REHYDRATION_INVALID_JSON",
  "MEDIA_DATA_NOT_FOUND",
  "SCHEMA_CHANGED",
] as const

export type TikTokErrorCode = (typeof tiktokErrorCodes)[number]

const sharedCode: Readonly<Record<TikTokErrorCode, ExtractErrorCode>> = {
  UNSUPPORTED_URL: "UNSUPPORTED_URL",
  SHORT_LINK_RESOLVE_FAILED: "RESOLVE_FAILED",
  UPSTREAM_FETCH_FAILED: "SOURCE_UNAVAILABLE",
  UPSTREAM_BLOCKED: "UPSTREAM_BLOCKED",
  REHYDRATION_NOT_FOUND: "PAYLOAD_MISSING",
  REHYDRATION_EMPTY: "PAYLOAD_MISSING",
  REHYDRATION_INVALID_JSON: "SCHEMA_CHANGED",
  MEDIA_DATA_NOT_FOUND: "PAYLOAD_MISSING",
  SCHEMA_CHANGED: "SCHEMA_CHANGED",
}

export function tiktokFailure(code: TikTokErrorCode, message: string): ExtractFailure {
  return { code: sharedCode[code], message, cause: code }
}
