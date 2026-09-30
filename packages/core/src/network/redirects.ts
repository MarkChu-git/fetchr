import { Effect } from "effect"
import type { ExtractFailure, Transport } from "../index"
import { isBlockedRequestTarget } from "./ssrf"

const redirectStatuses = new Set([301, 302, 303, 307, 308])

export interface RedirectPolicy {
  /** How many Location hops may be followed. The default is 5. */
  readonly maxRedirects?: number
  /** Platform allowlist. Checked again after every hop, in addition to the SSRF checks. */
  readonly allow: (url: URL) => boolean
}

export interface FollowedResponse {
  readonly url: URL
  readonly response: Response
}

/**
 * Follow redirects one hop at a time.
 * Each target is resolved with the WHATWG URL parser and rejected when it is private or outside `allow`.
 * The final response body is left unread so the caller can parse it once.
 */
export function followRedirects(
  input: URL,
  transport: Transport,
  policy: RedirectPolicy,
): Effect.Effect<FollowedResponse, ExtractFailure> {
  const maxRedirects = policy.maxRedirects ?? 5
  return Effect.gen(function* () {
    let current = input
    const seen = new Set<string>([current.href])
    const rejected = rejectTarget(current, policy.allow)
    if (rejected !== undefined) return yield* Effect.fail(rejected)

    for (let redirects = 0; ; redirects += 1) {
      const response = yield* transport.request(requestFor(current))
      if (!redirectStatuses.has(response.status)) {
        return { url: current, response }
      }
      if (redirects >= maxRedirects) {
        release(response)
        return yield* Effect.fail(
          redirectFailure("redirect-too-many", "Too many redirects"),
        )
      }
      const location = response.headers.get("location")?.trim()
      release(response)
      if (location === undefined || location.length === 0) {
        return yield* Effect.fail(
          redirectFailure("redirect-bad-location", "Redirect is missing a location"),
        )
      }
      let next: URL
      try {
        next = new URL(location, current)
      } catch {
        return yield* Effect.fail(
          redirectFailure("redirect-bad-location", "Redirect location is not a URL"),
        )
      }
      const nextRejected = rejectTarget(next, policy.allow)
      if (nextRejected !== undefined) return yield* Effect.fail(nextRejected)
      if (seen.has(next.href)) {
        return yield* Effect.fail(redirectFailure("redirect-loop", "Redirect loop"))
      }
      seen.add(next.href)
      current = next
    }
  })
}

/** Same checks as {@link followRedirects}, returning only the final URL. */
export function resolveRedirects(
  input: URL,
  transport: Transport,
  policy: RedirectPolicy,
): Effect.Effect<URL, ExtractFailure> {
  return Effect.map(followRedirects(input, transport, policy), (followed) => followed.url)
}

function requestFor(url: URL): Request {
  return new Request(url, {
    method: "GET",
    redirect: "manual",
    credentials: "omit",
  })
}

function rejectTarget(url: URL, allow: (url: URL) => boolean): ExtractFailure | undefined {
  // A TikTok URL can redirect anywhere. The original host does not vouch for the next one.
  if (isBlockedRequestTarget(url)) {
    return redirectFailure("blocked-target", "URL target is not a public http(s) address")
  }
  if (!allow(url)) {
    return redirectFailure("redirect-not-allowed", "URL target is not an allowed host")
  }
  return undefined
}

function redirectFailure(cause: string, message: string): ExtractFailure {
  return { code: "RESOLVE_FAILED", message, cause }
}

function release(response: Response): void {
  try {
    const body = response.body
    if (body === null) return
    void body.cancel().then(
      () => undefined,
      () => undefined,
    )
  } catch {
    // The redirect body is unused. A runtime that already closed it can be ignored.
  }
}
