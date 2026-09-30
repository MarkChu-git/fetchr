import { describe, expect, test } from "bun:test"
import { Cause, Effect, Exit, Option } from "effect"
import type { CanonicalResource, ExtractFailure, Transport } from "@fetchr/core"
import { youtubeExtractor } from "./index.ts"

const deliveryTypes = ["direct", "proxy", "mux", "playlist"] as const

function parseUnknown(text: string): unknown {
  return JSON.parse(text)
}

async function readFixture(name: string): Promise<unknown> {
  const text = await Bun.file(
    new URL(`../fixtures/${name}`, import.meta.url),
  ).text()
  return parseUnknown(text)
}

function fixtureTransport(body: unknown): Transport {
  return {
    request: () =>
      Effect.succeed(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
  }
}

const watchResource: CanonicalResource = {
  platform: "youtube",
  id: "dQw4w9WgXcQ",
  url: new URL("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
}

describe("youtube extractor match", () => {
  test("matches a watch URL and a youtu.be URL", () => {
    expect(
      youtubeExtractor.match(
        new URL("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
      ),
    ).toBe(true)
    expect(youtubeExtractor.match(new URL("https://youtu.be/dQw4w9WgXcQ"))).toBe(
      true,
    )
  })

  test("does not match an unrelated URL", () => {
    expect(youtubeExtractor.match(new URL("https://example.com/"))).toBe(false)
  })
})

describe("youtube extractor extract", () => {
  test("normalizes an anonymous player fixture into a MediaPost", async () => {
    const body = await readFixture("watch-dQw4w9WgXcQ.json")
    const exit = await Effect.runPromiseExit(
      youtubeExtractor.extract(watchResource, fixtureTransport(body)),
    )

    expect(Exit.isSuccess(exit)).toBe(true)
    if (!Exit.isSuccess(exit)) return

    const post = exit.value
    expect(post.platform).toBe("youtube")
    expect(post.id).toBe("dQw4w9WgXcQ")
    expect(post.canonicalUrl).toBe(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    )
    expect(post.title).toBe(
      "Rick Astley - Never Gonna Give You Up (Official Video)",
    )
    expect(post.description).toBe("fixture-description-dQw4w9WgXcQ")
    expect(post.media.length).toBeGreaterThan(0)

    const asset = post.media[0]
    expect(asset).toBeDefined()
    if (asset === undefined) return
    expect(asset.type).toBe("video")
    expect(deliveryTypes).toContain(asset.delivery.type)
    expect(asset.delivery).toEqual({
      type: "proxy",
      token: "pending",
      upstreamUrl:
        "https://fixture.googlevideo.invalid/videoplayback?id=dQw4w9WgXcQ&itag=18",
    })

    const encoded = JSON.stringify(post)
    expect(encoded).not.toContain("visitorData")
    expect(encoded).not.toContain("signatureCipher")
    expect(encoded).not.toContain("fixture-cipher")
    expect(encoded).not.toContain("playabilityStatus")
    expect(encoded).not.toContain("streamingData")
  })

  test("asks the Android client with the matching application user agent", async () => {
    const body = await readFixture("watch-dQw4w9WgXcQ.json")
    let seen: Request | undefined
    const transport: Transport = {
      request: (input) => {
        seen = input
        return Effect.succeed(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        )
      },
    }
    const exit = await Effect.runPromiseExit(
      youtubeExtractor.extract(watchResource, transport),
    )
    expect(Exit.isSuccess(exit)).toBe(true)
    expect(seen).toBeDefined()
    if (seen === undefined) return
    // A browser User-Agent makes this client return 400. The test locks the version and the identifier together.
    expect(seen.headers.get("user-agent")).toBe(
      "com.google.android.youtube/21.03.36(Linux; U; Android 16; en_US; SM-S908E Build/TP1A.220624.014) gzip",
    )
    const payload = JSON.parse(await seen.text()) as {
      context?: { client?: { clientName?: string; clientVersion?: string } }
    }
    expect(payload.context?.client?.clientName).toBe("ANDROID")
    expect(payload.context?.client?.clientVersion).toBe("21.03.36")
  })

  test("private video fails with PRIVATE_MEDIA and does not throw", async () => {
    const failure = await extractFailure("private.json", {
      platform: "youtube",
      id: "aaaaaaaaaaa",
      url: new URL("https://www.youtube.com/watch?v=aaaaaaaaaaa"),
    })
    expect(failure.code).toBe("PRIVATE_MEDIA")
  })

  test("removed video fails with MEDIA_NOT_FOUND and does not throw", async () => {
    const failure = await extractFailure("removed.json", {
      platform: "youtube",
      id: "bbbbbbbbbbb",
      url: new URL("https://www.youtube.com/watch?v=bbbbbbbbbbb"),
    })
    expect(failure.code).toBe("MEDIA_NOT_FOUND")
  })
})

async function extractFailure(
  fixture: string,
  resource: CanonicalResource,
): Promise<ExtractFailure> {
  const body = await readFixture(fixture)
  const exit = await Effect.runPromiseExit(
    youtubeExtractor.extract(resource, fixtureTransport(body)),
  )
  expect(Exit.hasDies(exit)).toBe(false)
  expect(Exit.hasFails(exit)).toBe(true)
  if (!Exit.isFailure(exit)) {
    throw new Error("expected a typed ExtractFailure")
  }
  const error = Cause.findErrorOption(exit.cause)
  if (!Option.isSome(error)) {
    throw new Error("expected a typed ExtractFailure")
  }
  return error.value
}
