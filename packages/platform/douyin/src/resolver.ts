import { hostAllowed, hostMatches } from "@fetchr/core"
import type {
  CanonicalResource,
  ExtractFailure,
  Transport,
} from "@fetchr/core"
import { Effect } from "effect"
import { failure } from "./failure"

const shortHost = "v.douyin.com"
const videoHosts = [
  "www.douyin.com",
  "douyin.com",
  "m.douyin.com",
  "www.iesdouyin.com",
  "iesdouyin.com",
] as const

function isVideoHost(hostname: string): boolean {
  // v.douyin.com is the short-link host. Matching the douyin.com apex would treat it as a video page.
  if (hostMatches(hostname, shortHost)) return false
  return hostAllowed(hostname, videoHosts)
}

function segments(url: URL): readonly string[] {
  return url.pathname.split("/").filter((segment) => segment.length > 0)
}

function digits(value: string | undefined): string | undefined {
  if (value === undefined || !/^\d+$/.test(value)) return undefined
  return value
}

type WorkKind = "video" | "note"

function workId(url: URL): { readonly id: string; readonly kind: WorkKind } | undefined {
  if (url.protocol !== "https:") return undefined
  if (!isVideoHost(url.hostname)) return undefined
  const parts = segments(url)
  // The first hop of a short link often stops on iesdouyin. Video is /share/video/{id}. An image note is /share/slides/{id} or /share/note/{id}.
  // Image notes do not belong in the video feed. The canonical URL has to be /note/{id}, or the later step never asks for the images.
  if (parts.length === 2 && (parts[0] === "video" || parts[0] === "note")) {
    const id = digits(parts[1])
    if (id === undefined) return undefined
    return { id, kind: parts[0] === "note" ? "note" : "video" }
  }
  if (parts[0] === "share" && parts.length === 3) {
    const id = digits(parts[2])
    if (id === undefined) return undefined
    if (parts[1] === "video") return { id, kind: "video" }
    if (parts[1] === "note" || parts[1] === "slides") return { id, kind: "note" }
  }
  return undefined
}

function shortCode(url: URL): string | undefined {
  if (url.protocol !== "https:") return undefined
  if (!hostMatches(url.hostname, shortHost)) return undefined
  const parts = segments(url)
  const code = parts[0]
  if (parts.length !== 1 || code === undefined) return undefined
  if (!/^[A-Za-z0-9]+$/.test(code)) return undefined
  return code
}

function modalId(url: URL): string | undefined {
  if (url.protocol !== "https:") return undefined
  if (!isVideoHost(url.hostname)) return undefined
  // A link copied from the website usually stops on /jingxuan?modal_id= or a profile modal_id, with no /video/ in the path. That number is the work id.
  return digits(url.searchParams.get("modal_id") ?? undefined)
}

function modalWork(url: URL): { readonly id: string; readonly kind: WorkKind } | undefined {
  const id = modalId(url)
  if (id === undefined) return undefined
  // The parameter itself does not say video or image note. Enter the feed as a video first. When the feed has no such item, the extractor asks for an image note.
  return { id, kind: "video" }
}

export function match(url: URL): boolean {
  return workId(url) !== undefined || shortCode(url) !== undefined || modalId(url) !== undefined
}

function canonicalWork(work: {
  readonly id: string
  readonly kind: WorkKind
}): CanonicalResource {
  const path = work.kind === "note" ? "note" : "video"
  return {
    platform: "douyin",
    id: work.id,
    url: new URL(`https://www.douyin.com/${path}/${work.id}`),
  }
}

export function resolveCanonical(
  resource: CanonicalResource,
  transport: Transport,
): Effect.Effect<CanonicalResource, ExtractFailure> {
  const direct = workId(resource.url) ?? modalWork(resource.url)
  if (direct !== undefined) return Effect.succeed(canonicalWork(direct))
  if (shortCode(resource.url) === undefined) {
    return Effect.fail(failure("UNSUPPORTED_URL", "URL is not a Douyin post"))
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
    const next = new URL(location, resource.url)
    const work = workId(next) ?? modalWork(next)
    if (work === undefined) {
      return yield* Effect.fail(
        failure(
          "RESOLVE_FAILED",
          "Douyin short link did not redirect to a post",
        ),
      )
    }
    return canonicalWork(work)
  })
}


