import type {
  CanonicalResource,
  ExtractFailure,
  Transport,
} from "@fetchr/core"
import { Effect } from "effect"
import { failure } from "./failure"
import { sign } from "./signer"

const shortHost = "v.douyin.com"
const videoHosts = new Set(["www.douyin.com", "douyin.com"])

function segments(url: URL): readonly string[] {
  return url.pathname.split("/").filter((segment) => segment.length > 0)
}

function videoId(url: URL): string | undefined {
  if (url.protocol !== "https:") return undefined
  if (!videoHosts.has(url.hostname)) return undefined
  const parts = segments(url)
  const id = parts[1]
  if (parts.length !== 2 || parts[0] !== "video" || id === undefined) {
    return undefined
  }
  if (!/^\d+$/.test(id)) return undefined
  return id
}

function shortCode(url: URL): string | undefined {
  if (url.protocol !== "https:") return undefined
  if (url.hostname !== shortHost) return undefined
  const parts = segments(url)
  const code = parts[0]
  if (parts.length !== 1 || code === undefined) return undefined
  if (!/^[A-Za-z0-9]+$/.test(code)) return undefined
  return code
}

export function match(url: URL): boolean {
  return videoId(url) !== undefined || shortCode(url) !== undefined
}

function canonicalVideo(id: string): CanonicalResource {
  return {
    platform: "douyin",
    id,
    url: new URL(`https://www.douyin.com/video/${id}`),
  }
}

export function resolveCanonical(
  resource: CanonicalResource,
  transport: Transport,
): Effect.Effect<CanonicalResource, ExtractFailure> {
  const direct = videoId(resource.url)
  if (direct !== undefined) return Effect.succeed(canonicalVideo(direct))
  if (shortCode(resource.url) === undefined) {
    return Effect.fail(failure("UNSUPPORTED_URL", "URL is not a Douyin video"))
  }
  return Effect.gen(function* () {
    const response = yield* transport.request(
      new Request(resource.url, { redirect: "manual" }),
    )
    const location = response.headers.get("location")
    if (location === null || location.length === 0) {
      return yield* Effect.fail(
        failure("RESOLVE_FAILED", "Douyin short link had no redirect"),
      )
    }
    const id = videoId(new URL(location, resource.url))
    if (id === undefined) {
      return yield* Effect.fail(
        failure(
          "RESOLVE_FAILED",
          "Douyin short link did not redirect to a video",
        ),
      )
    }
    return canonicalVideo(id)
  })
}

export function detailRequest(id: string, timestamp: number): Request {
  const url = new URL("https://www.douyin.com/aweme/v1/web/aweme/detail/")
  url.searchParams.set("aweme_id", id)
  const unsigned = url.toString()
  url.searchParams.set("fetchr_sign", sign(unsigned, timestamp))
  return new Request(url)
}
