import { expect, test } from "bun:test"
import { Effect } from "effect"
import type { Transport } from "../index"
import { hostMatches } from "../input/host"
import { followRedirects, resolveRedirects } from "./redirects"
import { isBlockedRequestTarget } from "./ssrf"

const allowTikTok = (url: URL): boolean => hostMatches(url.hostname, "tiktok.com")

function scripted(
  handler: (url: URL, calls: readonly string[]) => Response,
): { readonly transport: Transport; readonly calls: string[] } {
  const calls: string[] = []
  const transport: Transport = {
    request: (input) => {
      calls.push(input.url)
      return Effect.succeed(handler(new URL(input.url), calls))
    },
  }
  return { transport, calls }
}

function redirect(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } })
}

test("follows a short link to the canonical TikTok URL and keeps the final body", async () => {
  const canonical = "https://www.tiktok.com/@user/video/123"
  const { transport, calls } = scripted((url) => {
    if (url.hostname === "vt.tiktok.com") return redirect(canonical, 301)
    return new Response("page", { status: 200, headers: { "content-type": "text/html" } })
  })

  const followed = await Effect.runPromise(
    followRedirects(new URL("https://vt.tiktok.com/ZSxxxx/"), transport, {
      allow: allowTikTok,
    }),
  )

  expect(followed.url.href).toBe(canonical)
  expect(await followed.response.text()).toBe("page")
  expect(calls).toEqual(["https://vt.tiktok.com/ZSxxxx/", canonical])
  expect(
    (
      await Effect.runPromise(
        resolveRedirects(new URL("https://vt.tiktok.com/ZSxxxx/"), transport, {
          allow: allowTikTok,
        }),
      )
    ).href,
  ).toBe(canonical)
})

test("resolves a relative location against the current URL", async () => {
  const { transport } = scripted((url) => {
    if (url.pathname === "/ZSxxxx/") return redirect("/@user/video/9", 307)
    return new Response("ok", { status: 200 })
  })
  const url = await Effect.runPromise(
    resolveRedirects(new URL("https://vt.tiktok.com/ZSxxxx/"), transport, {
      allow: allowTikTok,
    }),
  )
  expect(url.href).toBe("https://vt.tiktok.com/@user/video/9")
})

test("follows several redirect statuses and then stops", async () => {
  const { transport, calls } = scripted((url) => {
    if (url.pathname === "/a") return redirect("https://vt.tiktok.com/b", 302)
    if (url.pathname === "/b") return redirect("https://www.tiktok.com/@u/video/1", 308)
    return new Response("done", { status: 200 })
  })
  const followed = await Effect.runPromise(
    followRedirects(new URL("https://vt.tiktok.com/a"), transport, { allow: allowTikTok }),
  )
  expect(followed.url.href).toBe("https://www.tiktok.com/@u/video/1")
  expect(calls.length).toBe(3)
})

test("rejects a redirect loop and too many hops", async () => {
  const loop = scripted((url) =>
    redirect(url.pathname === "/a" ? "https://vt.tiktok.com/b" : "https://vt.tiktok.com/a"),
  )
  const looped = await Effect.runPromise(
    Effect.result(
      followRedirects(new URL("https://vt.tiktok.com/a"), loop.transport, {
        allow: allowTikTok,
      }),
    ),
  )
  expect(looped._tag).toBe("Failure")
  if (looped._tag === "Failure") expect(looped.failure.cause).toBe("redirect-loop")
  expect(loop.calls).toEqual(["https://vt.tiktok.com/a", "https://vt.tiktok.com/b"])

  const chain = scripted((url) => {
    const step = Number(url.pathname.slice(1))
    return redirect(`https://vt.tiktok.com/${step + 1}`)
  })
  const limited = await Effect.runPromise(
    Effect.result(
      followRedirects(new URL("https://vt.tiktok.com/0"), chain.transport, {
        allow: allowTikTok,
        maxRedirects: 5,
      }),
    ),
  )
  expect(limited._tag).toBe("Failure")
  if (limited._tag === "Failure") expect(limited.failure.cause).toBe("redirect-too-many")
  expect(chain.calls.length).toBe(6)
})

test("rejects an unsupported host without fetching it", async () => {
  const { transport, calls } = scripted(() => redirect("https://example.com/phish"))
  const result = await Effect.runPromise(
    Effect.result(
      followRedirects(new URL("https://vt.tiktok.com/ZSxxxx/"), transport, {
        allow: allowTikTok,
      }),
    ),
  )
  expect(result._tag).toBe("Failure")
  if (result._tag === "Failure") expect(result.failure.cause).toBe("redirect-not-allowed")
  expect(calls).toEqual(["https://vt.tiktok.com/ZSxxxx/"])
})

const blockedTargets = [
  "http://127.0.0.1/",
  "http://127.1/",
  "http://localhost/admin",
  "http://app.localhost/",
  "http://[::1]/",
  "http://10.0.0.2/",
  "http://192.168.0.5/",
  "http://172.16.0.1/",
  "http://169.254.169.254/latest/meta-data",
  "http://2130706433/",
  "http://0x7f000001/",
  "http://0177.0.0.1/",
  "http://metadata.google.internal/",
  "http://[fe80::1]/",
  "http://[fd00::1]/",
  "file:///etc/passwd",
  "javascript://tiktok.com/alert",
  "https://user:pass@www.tiktok.com/@a/video/1",
]

test("does not fetch loopback, private, link-local, metadata, or credentialed targets", async () => {
  for (const target of blockedTargets) {
    const url = new URL(target)
    expect(isBlockedRequestTarget(url)).toBe(true)
    const { transport, calls } = scripted(() => new Response("nope"))
    const direct = await Effect.runPromise(
      Effect.result(followRedirects(url, transport, { allow: () => true })),
    )
    expect(direct._tag).toBe("Failure")
    if (direct._tag === "Failure") expect(direct.failure.cause).toBe("blocked-target")
    expect(calls).toEqual([])

    const hopped = scripted(() => redirect(target))
    const viaTikTok = await Effect.runPromise(
      Effect.result(
        followRedirects(new URL("https://vt.tiktok.com/ZSxxxx/"), hopped.transport, {
          allow: allowTikTok,
        }),
      ),
    )
    expect(viaTikTok._tag).toBe("Failure")
    if (viaTikTok._tag === "Failure") expect(viaTikTok.failure.cause).toBe("blocked-target")
    expect(hopped.calls).toEqual(["https://vt.tiktok.com/ZSxxxx/"])
  }
})

test("rejects a redirect that has no location", async () => {
  const { transport } = scripted(() => new Response(null, { status: 302 }))
  const result = await Effect.runPromise(
    Effect.result(
      resolveRedirects(new URL("https://vt.tiktok.com/ZSxxxx/"), transport, {
        allow: allowTikTok,
      }),
    ),
  )
  expect(result._tag).toBe("Failure")
  if (result._tag === "Failure") expect(result.failure.cause).toBe("redirect-bad-location")
})
