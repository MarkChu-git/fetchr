import type { ExtractFailure, Transport } from "@fetchr/core"
import { Effect, Schema } from "effect"
import { failure } from "./failure"
import { aBogus, msToken } from "./sign/abogus"

/**
 * The web detail endpoint answers both videos and image notes, but only to a
 * request the web client would sign: a fixed desktop User-Agent, a ttwid
 * cookie, msToken, and a_bogus over the sorted query.
 */
const detailEndpoint = "https://www.douyin.com/aweme/v1/web/aweme/detail/"
const ttwidEndpoint = "https://ttwid.bytedance.com/ttwid/union/register/"

export const webUserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

const ttwidTtlMillis = 24 * 60 * 60 * 1000

const detailParams = (id: string): Record<string, string> => ({
  device_platform: "webapp",
  aid: "6383",
  channel: "channel_pc_web",
  pc_client_type: "1",
  version_code: "290100",
  version_name: "29.1.0",
  cookie_enabled: "true",
  browser_language: "zh-CN",
  browser_platform: "Win32",
  browser_name: "Chrome",
  browser_version: "124.0.0.0",
  browser_online: "true",
  engine_name: "Blink",
  engine_version: "124.0.0.0",
  os_name: "Windows",
  os_version: "10",
  cpu_core_num: "8",
  device_memory: "8",
  platform: "PC",
  downlink: "10",
  aweme_id: id,
})

function signedQuery(id: string): string {
  const sorted = Object.entries(detailParams(id)).sort(([a], [b]) =>
    a < b ? -1 : 1,
  )
  let query = sorted
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&")
  query += `&msToken=${msToken()}`
  const signature = aBogus(query, "", webUserAgent, Math.floor(Date.now() / 1000))
  return `${query}&a_bogus=${signature}`
}

function ttwidFrom(headers: Headers): string | undefined {
  const lines =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [headers.get("set-cookie") ?? ""]
  for (const line of lines) {
    const match = /ttwid=([^;]*)/.exec(line)
    if (match?.[1] !== undefined && match[1].length > 0) return `ttwid=${match[1]}`
  }
  return undefined
}

const DetailShape = Schema.Struct({
  status_code: Schema.Number,
  aweme_detail: Schema.optionalKey(Schema.NullOr(Schema.Unknown)),
})

interface DetailCache {
  ttwid: string | undefined
  expiresAt: number
}

function bootstrapTtwid(
  transport: Transport,
): Effect.Effect<string, ExtractFailure> {
  return Effect.gen(function* () {
    const response = yield* transport.request(
      new Request(ttwidEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": webUserAgent,
        },
        body: JSON.stringify({
          region: "cn",
          aid: 6383,
          needFid: false,
          service: "www.ixigua.com",
          migrate_info: { ticket: "", source: "node" },
          cbUrlProtocol: "https",
          union: true,
        }),
      }),
    )
    const cookie = ttwidFrom(response.headers)
    if (cookie === undefined) {
      return yield* Effect.fail(
        failure("UPSTREAM_BLOCKED", "Douyin did not issue a ttwid cookie"),
      )
    }
    return cookie
  })
}

/** The endpoint answered but refused the work: deleted, filtered, or region locked. */
function absent(payload: { readonly aweme_detail?: unknown }): boolean {
  return payload.aweme_detail === null || payload.aweme_detail === undefined
}

export type DetailSource = (
  id: string,
  transport: Transport,
) => Effect.Effect<unknown, ExtractFailure>

function detailAttempt(
  id: string,
  transport: Transport,
  cookie: string,
): Effect.Effect<unknown, ExtractFailure> {
  return Effect.gen(function* () {
    const response = yield* transport.request(
      new Request(`${detailEndpoint}?${signedQuery(id)}`, {
        headers: {
          accept: "application/json",
          referer: "https://www.douyin.com/",
          "user-agent": webUserAgent,
          cookie,
        },
      }),
    )
    const blocked = failure(
      "UPSTREAM_BLOCKED",
      "Douyin web detail refused the signed request",
    )
    if (!response.ok) return yield* Effect.fail(blocked)
    const text = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: () => blocked,
    })
    // A refused signature still answers 200 with an empty body.
    if (text.length === 0) return yield* Effect.fail(blocked)
    let payload: unknown
    try {
      payload = JSON.parse(text)
    } catch {
      return yield* Effect.fail(blocked)
    }
    const shape = yield* Effect.mapError(
      Schema.decodeUnknownEffect(DetailShape)(payload),
      () => failure("SCHEMA_CHANGED", "Douyin web detail payload changed shape"),
    )
    if (absent(shape)) {
      return yield* Effect.fail(
        failure("MEDIA_NOT_FOUND", "Douyin web detail filtered this work"),
      )
    }
    return payload
  })
}

/**
 * Fetch one aweme detail through the signed web endpoint. The ttwid cookie is
 * cached for a day at module scope; a blocked answer drops the cache and tries
 * once more with a fresh cookie before reporting UPSTREAM_BLOCKED.
 */
export function createDetailSource(): DetailSource {
  let cache: DetailCache = { ttwid: undefined, expiresAt: 0 }

  const freshTtwid = (transport: Transport): Effect.Effect<string, ExtractFailure> =>
    Effect.map(bootstrapTtwid(transport), (cookie) => {
      cache = { ttwid: cookie, expiresAt: Date.now() + ttwidTtlMillis }
      return cookie
    })

  const ttwid = (transport: Transport): Effect.Effect<string, ExtractFailure> =>
    cache.ttwid !== undefined && Date.now() < cache.expiresAt
      ? Effect.succeed(cache.ttwid)
      : freshTtwid(transport)

  return (id, transport) =>
    Effect.gen(function* () {
      const cookie = yield* ttwid(transport)
      // Only a block earns one retry with a fresh cookie. A filtered work stays absent.
      return yield* Effect.matchEffect(detailAttempt(id, transport, cookie), {
        onSuccess: (payload) => Effect.succeed(payload),
        onFailure: (error) =>
          error.code !== "UPSTREAM_BLOCKED"
            ? Effect.fail(error)
            : Effect.flatMap(freshTtwid(transport), (refreshed) =>
                detailAttempt(id, transport, refreshed),
              ),
      })
    })
}

const ImagesPeek = Schema.Struct({
  aweme_detail: Schema.Struct({
    images: Schema.optionalKey(Schema.NullOr(Schema.Array(Schema.Unknown))),
  }),
})

/** The fallback path rewrites the canonical URL to /note/ when the detail carries images. */
export function detailHasImages(payload: unknown): boolean {
  try {
    const decoded = Schema.decodeUnknownSync(ImagesPeek)(payload)
    const images = decoded.aweme_detail.images
    return images !== undefined && images !== null && images.length > 0
  } catch {
    return false
  }
}
