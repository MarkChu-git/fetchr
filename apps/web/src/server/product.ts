import {
  extract,
  fixtureExtractor,
  type ExtractFailure,
  type MediaPost,
  type Transport,
} from "@fetchr/core"
import { assertPublicHttpUrl, verify } from "@fetchr/delivery"
import { bilibiliExtractor } from "@fetchr/platform-bilibili"
import { douyinExtractor } from "@fetchr/platform-douyin"
import { instagramExtractor } from "@fetchr/platform-instagram"
import { kuaishou } from "@fetchr/platform-kuaishou"
import { tiktokExtractor } from "@fetchr/platform-tiktok"
import { twitterExtractor } from "@fetchr/platform-twitter"
import { xiaohongshuExtractor } from "@fetchr/platform-xiaohongshu"
import { youtubeExtractor } from "@fetchr/platform-youtube"
import { Effect } from "effect"
import {
  clientAddress,
  deliveryKinds,
  readMetadata,
  rememberMetadata,
  safeLog,
  takePermit,
} from "./guard"
import { SealError, sealFailure, sealPost } from "./seal"

const devSecret = "fetchr-dev-proxy-secret"

/** Production must set FETCHR_PROXY_SECRET. Local development uses a fixed value so the page can run without a secret. */
export function proxySecret(): string {
  const configured = process.env.FETCHR_PROXY_SECRET
  if (configured !== undefined && configured.length >= 16) return configured
  if (process.env.NODE_ENV !== "production") return devSecret
  throw new Error("FETCHR_PROXY_SECRET is required")
}

export const productExtractors = [
  fixtureExtractor,
  youtubeExtractor,
  xiaohongshuExtractor,
  douyinExtractor,
  instagramExtractor,
  tiktokExtractor,
  kuaishou,
  bilibiliExtractor,
  twitterExtractor,
] as const

/**
 * Workers fetch sends no User-Agent by default.
 * Bilibili's Akamai answers Access Denied to an empty identifier, and the browser then cannot read bytes to mux.
 */
const fallbackUserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

export function headersForUpstream(source: HeadersInit): Headers {
  const headers = new Headers(source)
  const userAgent = headers.get("user-agent")
  if (userAgent === null || userAgent.length === 0) {
    headers.set("user-agent", fallbackUserAgent)
  }
  return headers
}

export const fetchTransport: Transport = {
  request: (input) =>
    Effect.tryPromise({
      try: () =>
        // Do not follow redirects. The platform decides whether to request Location, so a short link cannot be quietly swapped for an internal address.
        fetch(input, {
          headers: headersForUpstream(input.headers),
          redirect: "manual",
          signal: AbortSignal.timeout(12_000),
        }),
      catch: (): ExtractFailure => ({
        code: "UPSTREAM_TIMEOUT",
        message: "The upstream request did not finish",
      }),
    }),
}

export interface ExtractRequest {
  readonly url: string
  readonly ip: string
  readonly now: number
  readonly turnstileToken?: string
}

export type ExtractResponse =
  | { readonly ok: true; readonly post: MediaPost }
  | {
      readonly ok: false
      readonly code: ExtractFailure["code"]
      readonly challenge: boolean
    }

async function turnstilePasses(
  token: string | undefined,
  ip: string,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET
  if (secret === undefined || secret.length === 0) return false
  if (token === undefined || token.length === 0) return false
  const body = new URLSearchParams({
    secret,
    response: token,
    remoteip: ip,
  })
  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body },
  )
  const payload: unknown = await response.json()
  return (
    typeof payload === "object" &&
    payload !== null &&
    "success" in payload &&
    payload.success === true
  )
}

export async function runProductExtract(
  input: ExtractRequest,
): Promise<ExtractResponse> {
  const started = input.now
  const permit = takePermit(input.ip, "extract", input.now)
  if (!permit.ok) {
    const passed = await turnstilePasses(input.turnstileToken, input.ip)
    if (!passed) {
      console.info(
        safeLog({
          ok: false,
          error: "RATE_LIMITED",
          latencyMs: 0,
          delivery: [],
        }),
      )
      return { ok: false, code: "RATE_LIMITED", challenge: true }
    }
  }

  const outcome = await Effect.runPromise(
    Effect.match(extract(input.url, fetchTransport, productExtractors), {
      onFailure: (failure) => ({ ok: false as const, failure }),
      onSuccess: (post) => ({ ok: true as const, post }),
    }),
  )
  if (!outcome.ok) {
    console.info(
      safeLog({
        ok: false,
        error: outcome.failure.code,
        latencyMs: Date.now() - started,
        delivery: [],
      }),
    )
    return { ok: false, code: outcome.failure.code, challenge: false }
  }

  let post = outcome.post
  try {
    post = await sealPost(post, proxySecret(), input.now)
  } catch (error) {
    if (!(error instanceof SealError)) throw error
    console.info(
      safeLog({
        platform: post.platform,
        ok: false,
        error: sealFailure().code,
        latencyMs: Date.now() - started,
        delivery: [],
      }),
    )
    return { ok: false, code: "EXTRACTOR_BROKEN", challenge: false }
  }

  const cached = readMetadata(post.platform, post.id, input.now)
  if (cached !== undefined && post.title === undefined && cached.title !== undefined) {
    post = { ...post, title: cached.title }
  }
  rememberMetadata(post, input.now)
  console.info(
    safeLog({
      platform: post.platform,
      ok: true,
      latencyMs: Date.now() - started,
      delivery: deliveryKinds(post),
    }),
  )
  return { ok: true, post }
}

export function addressFrom(request: Request): string {
  return clientAddress(request.headers)
}

/** The browser video element sends only a single bytes= range. Other forms are not forwarded upstream. */
function byteRange(value: string | null): string | undefined {
  if (value === null) return undefined
  if (!/^bytes=\d*-\d*$/.test(value)) return undefined
  return value
}

/**
 * Fetch only the upstream stored in the token. A URL supplied by the caller is ignored.
 * inline is for the in-page video preview. Download links omit it and stay attachments.
 */
export async function openProxyDownload(
  token: string,
  now: number,
  ip: string,
  fetchImpl: typeof fetch = fetch,
  incoming?: { readonly range: string | null; readonly inline: boolean },
): Promise<Response> {
  const permit = takePermit(ip, "download", now)
  if (!permit.ok) {
    return Response.json({ code: "RATE_LIMITED" }, { status: 429 })
  }
  let claims
  try {
    claims = await verify({ token, now, secret: proxySecret() })
    assertPublicHttpUrl(claims.url)
  } catch {
    return new Response("下载链接无效", { status: 403 })
  }

  const headersForFetch = headersForUpstream(claims.headers)
  const range = byteRange(incoming?.range ?? null)
  // Seeking sends Range. Without forwarding it, the video waits for the whole file.
  if (range !== undefined) headersForFetch.set("range", range)
  // Douyin's play endpoint redirects to a CDN. Handing that redirect to the browser leaves no Location, so the picture stays empty.
  let currentUrl = claims.url
  let upstream = await fetchImpl(currentUrl, {
    headers: headersForFetch,
    redirect: "manual",
  })
  for (
    let hop = 0;
    hop < 2 && upstream.status >= 300 && upstream.status < 400;
    hop += 1
  ) {
    const location = upstream.headers.get("location")
    if (location === null) return new Response("上游跳转无效", { status: 502 })
    let next: URL
    try {
      next = new URL(location, currentUrl)
      assertPublicHttpUrl(next.toString())
    } catch {
      return new Response("上游跳转被拒绝", { status: 403 })
    }
    currentUrl = next.toString()
    upstream = await fetchImpl(currentUrl, {
      headers: headersForFetch,
      redirect: "manual",
    })
  }
  if (upstream.status >= 300 && upstream.status < 400) {
    return new Response("上游跳转过多", { status: 502 })
  }
  const headers = new Headers()
  const type = upstream.headers.get("content-type")
  if (type !== null) headers.set("content-type", type)
  for (const name of ["content-length", "content-range", "accept-ranges"]) {
    const value = upstream.headers.get(name)
    if (value !== null) headers.set(name, value)
  }
  const disposition = incoming?.inline === true ? "inline" : "attachment"
  headers.set(
    "content-disposition",
    `${disposition}; filename="${claims.platform}-${claims.expiry}"`,
  )
  // Stream the upstream body. Do not read the whole video into the Worker.
  return new Response(upstream.body, { status: upstream.status, headers })
}
