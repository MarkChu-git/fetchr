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

test("extracts the URL embedded in share text", async () => {
  const post = await Effect.runPromise(
    extract(
      "2.58 复制打开，看看【示例的作品】 https://fixture.test/video/demo t@e.OK PxF:/",
      transport,
      [fixtureExtractor],
    ),
  )

  expect(post.id).toBe("demo")
  expect(post.canonicalUrl).toBe("https://fixture.test/video/demo")
})

test("strips invisible characters out of a pasted URL", async () => {
  const post = await Effect.runPromise(
    extract(
      `https://fixture.test/video/${String.fromCodePoint(0x200b, 0x200d)}demo`,
      transport,
      [fixtureExtractor],
    ),
  )

  expect(post.id).toBe("demo")
  expect(post.canonicalUrl).toBe("https://fixture.test/video/demo")
})

test("stops a pasted URL before Chinese that is glued to it", async () => {
  const post = await Effect.runPromise(
    extract(
      "https://fixture.test/video/demo复制此链接，打开抖音搜索，直接观看视频！",
      transport,
      [fixtureExtractor],
    ),
  )

  expect(post.id).toBe("demo")
  expect(post.canonicalUrl).toBe("https://fixture.test/video/demo")
})

test("uses the first detected URL that an extractor accepts", async () => {
  const post = await Effect.runPromise(
    extract(
      "skip https://example.com/nope\nthen https://fixture.test/video/demo.",
      transport,
      [fixtureExtractor],
    ),
  )
  expect(post.id).toBe("demo")
})

test("reads a URL wrapped in emoji, newlines, and parentheses", async () => {
  const post = await Effect.runPromise(
    extract("🔥 look\n(https://fixture.test/video/demo)\nend", transport, [fixtureExtractor]),
  )
  expect(post.canonicalUrl).toBe("https://fixture.test/video/demo")
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

test("extracts a fixture with separate picture and sound into Mux delivery", async () => {
  const post = await Effect.runPromise(
    extract("https://fixture.test/mux/demo", transport, [fixtureExtractor]),
  )

  expect(post.id).toBe("mux")
  expect(post.title).toBe("分开的画面和声音")
  const asset = post.media[0]
  expect(asset?.type).toBe("video")
  if (asset?.type !== "video") {
    throw new Error("expected a video asset")
  }
  expect(asset.delivery).toEqual({
    type: "mux",
    outputContainer: "mp4",
    video: { url: "/mux-fixture/video.mp4" },
    audio: { url: "/mux-fixture/audio.m4a" },
  })
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
  const mux = await Effect.runPromise(
    extract("https://fixture.test/mux/demo", countingTransport, [fixtureExtractor]),
  )

  expect(video.id).toBe("demo")
  expect(album.id).toBe("album")
  expect(mux.id).toBe("mux")
  expect(calls).toBe(0)
})
