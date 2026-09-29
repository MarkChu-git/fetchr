import type { Delivery, ExtractFailure, MediaAsset, MediaPost } from "@fetchr/core"
import { sign } from "@fetchr/delivery"

const pending = "pending"

function hasHeaders(
  headers: Readonly<Record<string, string>> | undefined,
): headers is Readonly<Record<string, string>> {
  return headers !== undefined && Object.keys(headers).length > 0
}

async function sealSource(
  source: { readonly url: string; readonly headers?: Readonly<Record<string, string>> },
  post: MediaPost,
  secret: string,
  now: number,
) {
  if (!hasHeaders(source.headers)) return { url: source.url }
  const token = await sign({
    url: source.url,
    headers: source.headers,
    platform: post.platform,
    issuedAt: now,
    secret,
  })
  // A same-origin download URL lets the browser read the bytes. Muxing still happens on the device. The upstream URL stays inside the signature.
  return { url: `/download/${token}` }
}

async function sealedDelivery(
  delivery: Delivery,
  post: MediaPost,
  secret: string,
  now: number,
): Promise<Delivery> {
  if (delivery.type === "mux") {
    return {
      type: "mux",
      outputContainer: delivery.outputContainer,
      video: await sealSource(delivery.video, post, secret, now),
      audio: await sealSource(delivery.audio, post, secret, now),
    }
  }
  if (delivery.type === "direct" && hasHeaders(delivery.headers)) {
    const token = await sign({
      url: delivery.url,
      headers: delivery.headers,
      platform: post.platform,
      issuedAt: now,
      secret,
    })
    return { type: "proxy", token }
  }
  if (delivery.type !== "proxy") return delivery
  if (delivery.token !== pending && delivery.upstreamUrl === undefined) {
    return { type: "proxy", token: delivery.token }
  }
  if (delivery.upstreamUrl === undefined) {
    throw new SealError("代理交付缺少上游地址，无法签名")
  }
  const token = await sign({
    url: delivery.upstreamUrl,
    headers: delivery.upstreamHeaders ?? {},
    platform: post.platform,
    issuedAt: now,
    secret,
  })
  return { type: "proxy", token }
}

async function sealAsset(
  asset: MediaAsset,
  post: MediaPost,
  secret: string,
  now: number,
): Promise<MediaAsset> {
  return {
    ...asset,
    delivery: await sealedDelivery(asset.delivery, post, secret, now),
  }
}

export class SealError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SealError"
  }
}

/** The browser should only see the token. The upstream URL and the attached headers stay inside the signature. */
export async function sealPost(
  post: MediaPost,
  secret: string,
  now: number,
): Promise<MediaPost> {
  const media: MediaAsset[] = []
  for (const asset of post.media) {
    media.push(await sealAsset(asset, post, secret, now))
  }
  return { ...post, media }
}

export function sealFailure(): ExtractFailure {
  return {
    code: "EXTRACTOR_BROKEN",
    message: "Proxy delivery could not be signed",
  }
}
