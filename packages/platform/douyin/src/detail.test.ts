import { describe, expect, test } from "bun:test"
import type { ExtractFailure, Transport } from "@fetchr/core"
import { Cause, Effect, Exit, Option } from "effect"
import { createDetailSource, detailHasImages } from "./detail"

const noteId = "7000000000000000002"

const detailPayload = {
  status_code: 0,
  aweme_detail: {
    aweme_id: noteId,
    desc: "fixture note",
    images: [{ url_list: ["https://cdn.example/images/one.jpg"] }],
  },
}

function ttwidResponse(cookie = "ttwid=fresh-cookie"): Response {
  return new Response("{}", {
    headers: { "set-cookie": `${cookie}; Path=/; Domain=bytedance.com` },
  })
}

function detailTransport(
  handler: (url: URL, calls: number) => Response,
): { transport: Transport; seen: Request[] } {
  const seen: Request[] = []
  let calls = 0
  return {
    seen,
    transport: {
      request(input) {
        seen.push(input)
        calls += 1
        const url = new URL(input.url)
        if (url.hostname === "ttwid.bytedance.com") {
          return Effect.succeed(ttwidResponse())
        }
        return Effect.succeed(handler(url, calls))
      },
    },
  }
}

async function failureOf(
  effect: Effect.Effect<unknown, ExtractFailure>,
): Promise<ExtractFailure> {
  const exit = await Effect.runPromiseExit(effect)
  if (!Exit.isFailure(exit)) throw new Error("expected detail to fail")
  const error = Cause.findErrorOption(exit.cause)
  if (!Option.isSome(error)) throw new Error("expected a typed failure")
  return error.value
}

describe("web detail source", () => {
  test("bootstraps ttwid once and signs the detail request", async () => {
    const { transport, seen } = detailTransport(() =>
      Response.json(detailPayload),
    )
    const source = createDetailSource()
    const payload = await Effect.runPromise(source(noteId, transport))
    expect((payload as typeof detailPayload).aweme_detail?.aweme_id).toBe(noteId)

    const register = seen.filter((item) =>
      item.url.includes("ttwid.bytedance.com"),
    )
    expect(register).toHaveLength(1)

    const detail = seen.find((item) => item.url.includes("aweme/detail"))
    expect(detail).toBeDefined()
    const url = new URL(detail?.url ?? "")
    expect(url.searchParams.get("aweme_id")).toBe(noteId)
    expect(url.searchParams.get("msToken")).not.toBeNull()
    expect(url.searchParams.get("a_bogus")).not.toBeNull()
    expect(detail?.headers.get("cookie")).toBe("ttwid=fresh-cookie")
  })

  test("reuses the cached ttwid on a second call", async () => {
    const { transport, seen } = detailTransport(() =>
      Response.json(detailPayload),
    )
    const source = createDetailSource()
    await Effect.runPromise(source(noteId, transport))
    await Effect.runPromise(source(noteId, transport))
    expect(
      seen.filter((item) => item.url.includes("ttwid.bytedance.com")),
    ).toHaveLength(1)
  })

  test("an empty body earns one retry with a fresh cookie, then reports UPSTREAM_BLOCKED", async () => {
    const { transport, seen } = detailTransport(() => new Response(""))
    const source = createDetailSource()
    const failure = await failureOf(source(noteId, transport))
    expect(failure.code).toBe("UPSTREAM_BLOCKED")
    expect(
      seen.filter((item) => item.url.includes("ttwid.bytedance.com")),
    ).toHaveLength(2)
    expect(
      seen.filter((item) => item.url.includes("aweme/detail")),
    ).toHaveLength(2)
  })

  test("a filtered work is MEDIA_NOT_FOUND without a retry", async () => {
    const { transport, seen } = detailTransport(() =>
      Response.json({
        status_code: 0,
        aweme_detail: null,
        filter_detail: { aweme_id: noteId, filter_reason: "" },
      }),
    )
    const source = createDetailSource()
    const failure = await failureOf(source(noteId, transport))
    expect(failure.code).toBe("MEDIA_NOT_FOUND")
    expect(
      seen.filter((item) => item.url.includes("aweme/detail")),
    ).toHaveLength(1)
  })

  test("a missing ttwid cookie blocks the source", async () => {
    const transport: Transport = {
      request(input) {
        if (input.url.includes("ttwid.bytedance.com")) {
          return Effect.succeed(new Response("{}"))
        }
        return Effect.succeed(Response.json(detailPayload))
      },
    }
    const failure = await failureOf(createDetailSource()(noteId, transport))
    expect(failure.code).toBe("UPSTREAM_BLOCKED")
  })
})

describe("detailHasImages", () => {
  test("is true when the detail carries images and false for a video", () => {
    expect(detailHasImages(detailPayload)).toBe(true)
    expect(
      detailHasImages({
        status_code: 0,
        aweme_detail: { aweme_id: noteId, images: null },
      }),
    ).toBe(false)
    expect(detailHasImages({ status_code: 0, aweme_detail: {} })).toBe(false)
    expect(detailHasImages("not a payload")).toBe(false)
  })
})
