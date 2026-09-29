import type { ExtractErrorCode, MediaPost, Platform } from "@fetchr/core"

/** Extraction is tighter than download. These numbers are in-memory limits on one isolate. Each Worker instance counts on its own. */
const extractPerMinute = 10
const downloadPerMinute = 60
const windowMs = 60_000
const metadataTtlMs = 10 * 60_000

interface Bucket {
  readonly stamps: number[]
}

const buckets = new Map<string, Bucket>()

export interface MetadataRecord {
  readonly platform: Platform
  readonly id: string
  readonly title?: string
  readonly description?: string
  readonly authorName?: string
  readonly storedAt: number
}

const metadata = new Map<string, MetadataRecord>()

export function resetGuards(): void {
  buckets.clear()
  metadata.clear()
}

export function clientAddress(headers: Headers): string {
  const forwarded = headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for")
  if (forwarded === null || forwarded.length === 0) return "unknown"
  return forwarded.split(",")[0]?.trim() || "unknown"
}

/**
 * Over the limit, require a challenge. Within the limit, challenge is false and the page does not show Turnstile.
 * kind splits extraction and download into two buckets. Extraction is stricter.
 */
export function takePermit(
  ip: string,
  kind: "extract" | "download",
  now: number,
): { readonly ok: true } | { readonly ok: false; readonly challenge: true } {
  const limit = kind === "extract" ? extractPerMinute : downloadPerMinute
  const key = `${kind}:${ip}`
  const current = buckets.get(key)?.stamps ?? []
  const fresh = current.filter((stamp) => now - stamp < windowMs)
  if (fresh.length >= limit) {
    buckets.set(key, { stamps: fresh })
    return { ok: false, challenge: true }
  }
  buckets.set(key, { stamps: [...fresh, now] })
  return { ok: true }
}

/** Store text only. Delivery URLs and media bytes stay out of the cache so an expired CDN link is not sent again. */
export function rememberMetadata(post: MediaPost, now: number): void {
  const authorName = post.author?.name ?? post.author?.username
  const record: MetadataRecord = {
    platform: post.platform,
    id: post.id,
    storedAt: now,
    ...(post.title === undefined ? {} : { title: post.title }),
    ...(post.description === undefined ? {} : { description: post.description }),
    ...(authorName === undefined ? {} : { authorName }),
  }
  metadata.set(`${post.platform}:${post.id}`, record)
}

export function readMetadata(
  platform: Platform,
  id: string,
  now: number,
): MetadataRecord | undefined {
  const record = metadata.get(`${platform}:${id}`)
  if (record === undefined) return undefined
  if (now - record.storedAt > metadataTtlMs) {
    metadata.delete(`${platform}:${id}`)
    return undefined
  }
  return record
}

export interface SafeLog {
  readonly platform?: Platform
  readonly ok: boolean
  readonly error?: ExtractErrorCode
  readonly latencyMs: number
  readonly delivery: readonly string[]
}

/** Logs keep platform, outcome, duration, error code, and delivery type. They omit cookies, authorization headers, signed URLs, and the full input URL. */
export function safeLog(entry: SafeLog): string {
  return JSON.stringify({
    platform: entry.platform ?? null,
    ok: entry.ok,
    error: entry.error ?? null,
    latencyMs: entry.latencyMs,
    delivery: entry.delivery,
  })
}

export function deliveryKinds(post: MediaPost): readonly string[] {
  return post.media.map((asset) => asset.delivery.type)
}
