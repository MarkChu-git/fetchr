import { expect, test } from "bun:test"
import { Effect } from "effect"
import { extract, fixtureExtractor, type Transport } from "@fetchr/core"

const transport: Transport = {
  request: () =>
    Effect.fail({
      code: "SOURCE_UNAVAILABLE",
      message: "fixture must not use transport",
    }),
}

test("extracts a fixture video URL into a MediaPost with Direct delivery", async () => {
  const post = await Effect.runPromise(
    extract("https://fixture.test/video/demo", transport, [fixtureExtractor]),
  )

  expect(post.platform).toBe("fixture")
  expect(post.id).toBe("demo")
  expect(post.canonicalUrl).toBe("https://fixture.test/video/demo")
  expect(post.author).toEqual({ name: "Fixture" })
  expect(post.title).toBe("演示视频")
  expect(post.media.length).toBe(1)

  const asset = post.media[0]
  expect(asset?.type).toBe("video")
  if (asset?.type !== "video") {
    throw new Error("expected a video asset")
  }
  expect(asset.delivery).toEqual({
    type: "direct",
    url: "https://fixture.test/media/demo.mp4",
  })
})

test("extracts a fixture image post into two Direct image assets", async () => {
  const post = await Effect.runPromise(
    extract("https://fixture.test/image/album", transport, [fixtureExtractor]),
  )

  expect(post.platform).toBe("fixture")
  expect(post.id).toBe("album")
  expect(post.canonicalUrl).toBe("https://fixture.test/image/album")
  expect(post.media.length).toBe(2)

  const first = post.media[0]
  const second = post.media[1]
  expect(first?.type).toBe("image")
  expect(second?.type).toBe("image")
  if (first?.type !== "image" || second?.type !== "image") {
    throw new Error("expected two image assets")
  }
  expect(first.delivery).toEqual({
    type: "direct",
    url: "https://fixture.test/media/a.jpg",
  })
  expect(second.delivery).toEqual({
    type: "direct",
    url: "https://fixture.test/media/b.jpg",
  })
})

test("extract fails with INVALID_URL when the input is not a URL", async () => {
  const code = await Effect.runPromise(
    Effect.match(extract("not a url", transport, [fixtureExtractor]), {
      onFailure: (error) => error.code,
      onSuccess: () => "SUCCESS" as const,
    }),
  )

  expect(code).toBe("INVALID_URL")
})

test("extract fails with UNSUPPORTED_URL when no extractor matches", async () => {
  const code = await Effect.runPromise(
    Effect.match(extract("https://example.com/nope", transport, [fixtureExtractor]), {
      onFailure: (error) => error.code,
      onSuccess: () => "SUCCESS" as const,
    }),
  )

  expect(code).toBe("UNSUPPORTED_URL")
})

test("extracting a fixture MediaPost does not use Transport", async () => {
  let calls = 0
  const countingTransport: Transport = {
    request: () => {
      calls += 1
      return Effect.fail({
        code: "SOURCE_UNAVAILABLE",
        message: "fixture must not use transport",
      })
    },
  }

  const video = await Effect.runPromise(
    extract("https://fixture.test/video/demo", countingTransport, [fixtureExtractor]),
  )
  const album = await Effect.runPromise(
    extract("https://fixture.test/image/album", countingTransport, [fixtureExtractor]),
  )

  expect(video.id).toBe("demo")
  expect(album.id).toBe("album")
  expect(calls).toBe(0)
})
