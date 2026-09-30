import { expect, test } from "bun:test"
import type { CanonicalResource, Transport } from "@fetchr/core"
import { Effect } from "effect"
import { kuaishou } from "./index"

const shortVideoUrl = "https://www.kuaishou.com/short-video/7000000000000000001"
const imageUrl = "https://www.kuaishou.com/short-video/7000000000000000002"
const directUrl = "https://www.kuaishou.com/short-video/7000000000000000003"

test("match accepts a v.kuaishou.com short link", () => {
  expect(kuaishou.match(new URL("https://v.kuaishou.com/abc123"))).toBe(true)
})

test("match accepts a www.kuaishou.com short-video url", () => {
  expect(kuaishou.match(new URL(shortVideoUrl))).toBe(true)
  expect(
    kuaishou.match(new URL(`${shortVideoUrl}?cc=share_copylink`)),
  ).toBe(true)
})

test("match rejects douyin and unrelated hosts", () => {
  expect(kuaishou.match(new URL("https://www.douyin.com/video/1"))).toBe(false)
  expect(kuaishou.match(new URL("https://example.com/"))).toBe(false)
})

test("extracts a short-video fixture into one kuaishou video", async () => {
  const post = await extract(shortVideoUrl, apolloPage(videoApollo))

  expect(post).toEqual({
    platform: "kuaishou",
    id: "7000000000000000001",
    canonicalUrl: shortVideoUrl,
    author: {
      id: "anon-author",
      name: "匿名作者",
      avatar: "https://p1.a.yximgs.com/kos/anon-avatar.jpg",
    },
    description: "匿名短视频",
    thumbnail: "https://p1.a.yximgs.com/upic/anon-cover.jpg",
    publishedAt: "2023-11-14T22:13:20.000Z",
    media: [
      {
        type: "video",
        id: "7000000000000000001",
        width: 720,
        height: 1280,
        fps: 30,
        codec: "avc1.64001f",
        container: "mp4",
        bitrate: 1_200_000,
        thumbnail: "https://p1.a.yximgs.com/upic/anon-cover.jpg",
        delivery: {
          type: "proxy",
          token: "pending",
          upstreamUrl: "https://v1.kwaicdn.com/ksc1/anon-720.mp4",
          upstreamHeaders: { Referer: "https://www.kuaishou.com/" },
        },
      },
    ],
  })
})

test("extracts an image fixture into image media", async () => {
  const post = await extract(imageUrl, initPage(imageInit))

  expect(post).toEqual({
    platform: "kuaishou",
    id: "7000000000000000002",
    canonicalUrl: imageUrl,
    author: {
      id: "anon-author",
      name: "匿名作者",
      avatar: "https://p1.a.yximgs.com/kos/anon-avatar.jpg",
    },
    description: "匿名图集",
    thumbnail: "https://p2.a.yximgs.com/upic/anon-image-cover.jpg",
    media: [
      {
        type: "image",
        id: "7000000000000000002:0",
        width: 1080,
        height: 1440,
        delivery: {
          type: "direct",
          url: "https://cdn.example/atlas/anon_0.jpg",
        },
      },
      {
        type: "image",
        id: "7000000000000000002:1",
        width: 1080,
        height: 1350,
        delivery: {
          type: "proxy",
          token: "pending",
          upstreamUrl: "https://tx2.a.yximgs.com/ufile/atlas/anon_1.jpg",
          upstreamHeaders: { Referer: "https://www.kuaishou.com/" },
        },
      },
    ],
  })
})

test("uses direct delivery when the cdn does not need a referer", async () => {
  const post = await extract(directUrl, apolloPage(directApollo))
  expect(post.media).toEqual([
    {
      type: "video",
      id: "7000000000000000003",
      container: "mp4",
      delivery: {
        type: "direct",
        url: "https://cdn.example/anon-video.mp4",
      },
    },
  ])
})

function extract(url: string, html: string) {
  const address = new URL(url)
  const segments = address.pathname.split("/").filter((part) => part.length > 0)
  const id = segments.at(-1)
  const resource: CanonicalResource = {
    platform: "kuaishou",
    url: address,
    ...(id === undefined ? {} : { id }),
  }
  const transport: Transport = {
    request: (input) => {
      expect(input.url).toBe(address.href)
      return Effect.succeed(new Response(html, { status: 200 }))
    },
  }
  return Effect.runPromise(kuaishou.extract(resource, transport))
}

function apolloPage(state: unknown): string {
  return page("window.__APOLLO_STATE__", state)
}

function initPage(state: unknown): string {
  return page("window.INIT_STATE", state)
}

function page(marker: string, state: unknown): string {
  return `<!doctype html><html><head><script>${marker}=${JSON.stringify(state)};</script></head><body></body></html>`
}

const videoApollo = {
  defaultClient: {
    "VisionVideoDetailAuthor:anon-author": {
      __typename: "VisionVideoDetailAuthor",
      id: "anon-author",
      name: "匿名作者",
      headerUrl: "https://p1.a.yximgs.com/kos/anon-avatar.jpg",
    },
    "VisionVideoDetailPhoto:7000000000000000001": {
      __typename: "VisionVideoDetailPhoto",
      id: "7000000000000000001",
      caption: "匿名短视频",
      coverUrl: "https://p1.a.yximgs.com/upic/anon-cover.jpg",
      photoUrl: "https://v1.kwaicdn.com/ksc1/anon-photo.mp4",
      photoH265Url: "https://v1.kwaicdn.com/ksc1/anon-hevc.mp4",
      duration: 12_000,
      timestamp: 1_700_000_000_000,
      manifest: {
        type: "json",
        json: {
          adaptationSet: [
            {
              representation: [
                {
                  url: "https://v1.kwaicdn.com/ksc1/anon-720.mp4",
                  width: 720,
                  height: 1280,
                  avgBitrate: 1_200_000,
                  frameRate: 30,
                  codecs: "avc1.64001f",
                },
              ],
            },
          ],
        },
      },
    },
    ROOT_QUERY: {
      __typename: "Query",
      'visionVideoDetail({"page":"detail","photoId":"7000000000000000001"})': {
        __typename: "VisionVideoDetail",
        status: 1,
        author: { __ref: "VisionVideoDetailAuthor:anon-author" },
        photo: { __ref: "VisionVideoDetailPhoto:7000000000000000001" },
      },
    },
  },
}

const imageInit = {
  "anon-page": {
    result: 1,
    photo: {
      photoId: "7000000000000000002",
      caption: "匿名图集",
      userEid: "anon-author",
      userId: 10001,
      userName: "匿名作者",
      headUrl: "https://p1.a.yximgs.com/kos/anon-avatar.jpg",
      coverUrls: [
        { url: "https://p2.a.yximgs.com/upic/anon-image-cover.jpg" },
      ],
      ext_params: {
        atlas: {
          cdn: ["tx2.a.yximgs.com"],
          list: [
            "https://cdn.example/atlas/anon_0.jpg",
            "ufile/atlas/anon_1.jpg",
          ],
          size: [
            { w: 1080, h: 1440 },
            { w: 1080, h: 1350 },
          ],
        },
      },
    },
  },
}

const directApollo = {
  defaultClient: {
    "VisionVideoDetailAuthor:anon-author": {
      __typename: "VisionVideoDetailAuthor",
      id: "anon-author",
      name: "匿名作者",
    },
    "VisionVideoDetailPhoto:7000000000000000003": {
      __typename: "VisionVideoDetailPhoto",
      id: "7000000000000000003",
      caption: "无需 Referer 的匿名视频",
      photoUrl: "https://cdn.example/anon-video.mp4",
    },
  },
}
