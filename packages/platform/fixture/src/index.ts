import { Effect } from "effect"
import type { ExtractFailure, Extractor, MediaPost } from "@fetchr/core"

const videoPost: MediaPost = {
  platform: "fixture",
  id: "demo",
  canonicalUrl: "https://fixture.test/video/demo",
  author: { name: "Fixture" },
  title: "演示视频",
  media: [
    {
      type: "video",
      id: "demo",
      delivery: {
        type: "direct",
        url: "https://fixture.test/media/demo.mp4",
      },
    },
  ],
}

/**
 * Picture and audio are two small same-origin files. The browser can read the bytes. Muxing runs in a worker behind the page.
 * The URLs are not a platform CDN.
 */
const muxPost: MediaPost = {
  platform: "fixture",
  id: "mux",
  canonicalUrl: "https://fixture.test/mux/demo",
  author: { name: "Fixture" },
  title: "分开的画面和声音",
  media: [
    {
      type: "video",
      id: "mux",
      delivery: {
        type: "mux",
        outputContainer: "mp4",
        video: { url: "/mux-fixture/video.mp4" },
        audio: { url: "/mux-fixture/audio.m4a" },
      },
    },
  ],
}

const albumPost: MediaPost = {
  platform: "fixture",
  id: "album",
  canonicalUrl: "https://fixture.test/image/album",
  media: [
    {
      type: "image",
      id: "a",
      delivery: {
        type: "direct",
        url: "https://fixture.test/media/a.jpg",
      },
    },
    {
      type: "image",
      id: "b",
      delivery: {
        type: "direct",
        url: "https://fixture.test/media/b.jpg",
      },
    },
  ],
}

function postFor(url: URL): MediaPost | undefined {
  if (url.protocol !== "https:" || url.hostname !== "fixture.test") {
    return undefined
  }
  if (url.pathname === "/video/demo") return videoPost
  if (url.pathname === "/image/album") return albumPost
  if (url.pathname === "/mux/demo") return muxPost
  return undefined
}

export const fixtureExtractor: Extractor = {
  platform: "fixture",
  match(url) {
    return postFor(url) !== undefined
  },
  // Posts are static. Transport stays on the signature so every extractor looks the same.
  extract(resource, _transport) {
    const post = postFor(resource.url)
    if (post === undefined) {
      return Effect.fail<ExtractFailure>({
        code: "UNSUPPORTED_URL",
        message: "Fixture URL is not a known post",
      })
    }
    return Effect.succeed(post)
  },
}
