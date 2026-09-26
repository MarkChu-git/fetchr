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
