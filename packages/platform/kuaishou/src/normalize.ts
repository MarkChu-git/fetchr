import {
  unsignedProxy,
  type Author,
  type CanonicalResource,
  type Delivery,
  type ImageAsset,
  type MediaAsset,
  type MediaPost,
  type VideoAsset,
} from "@fetchr/core"
import { Option, Schema } from "effect"
import {
  ApolloState,
  Atlas,
  Detail,
  InitState,
  ManifestBody,
  Representation,
  ShareEntry,
  VisionAuthorEntity,
  VideoResourceJson,
  VisionPhoto,
  WrappedManifest,
  WrappedVideoResource,
} from "./schema"

// Kuaishou CDNs reject a browser fetch that does not send their Referer.
// Signing happens later; the post only records that the delivery is still pending.
const refererHostSuffixes = [
  "kwaicdn.com",
  "yximgs.com",
  "kwimgs.com",
  "gifshow.com",
  "kuaishou.com",
] as const

type Apollo = typeof ApolloState.Type
type Vision = typeof VisionPhoto.Type
type AuthorEntity = typeof VisionAuthorEntity.Type
type DetailState = typeof Detail.Type
type Share = typeof ShareEntry.Type
type AtlasState = typeof Atlas.Type
type Manifest = typeof ManifestBody.Type
type RepresentationState = typeof Representation.Type
type Client = Apollo["defaultClient"]

interface Candidate {
  readonly url: string
  readonly codecRank: number
  readonly pixels: number
  readonly width?: number
  readonly height?: number
  readonly fps?: number
  readonly codec?: string
  readonly bitrate?: number
}

export type Normalized =
  | { readonly _tag: "Post"; readonly post: MediaPost }
  | { readonly _tag: "Schema" }
  | { readonly _tag: "Empty" }

export function normalize(
  resource: CanonicalResource,
  payload: unknown,
  wanted: string | undefined,
): Normalized {
  const apollo = Schema.decodeUnknownOption(ApolloState)(payload)
  if (Option.isSome(apollo)) {
    const post = fromApollo(resource, apollo.value, wanted)
    return post === undefined ? { _tag: "Empty" } : { _tag: "Post", post }
  }
  const init = Schema.decodeUnknownOption(InitState)(payload)
  if (Option.isSome(init)) {
    const post = fromInit(resource, init.value, wanted)
    return post === undefined ? { _tag: "Empty" } : { _tag: "Post", post }
  }
  return { _tag: "Schema" }
}

function fromApollo(
  resource: CanonicalResource,
  state: Apollo,
  wanted: string | undefined,
): MediaPost | undefined {
  const photos: Vision[] = []
  for (const value of Object.values(state.defaultClient)) {
    const decoded = Schema.decodeUnknownOption(VisionPhoto)(value)
    if (Option.isSome(decoded)) photos.push(decoded.value)
  }
  const photo = choose(photos, wanted, (item) => item.id)
  if (photo === undefined) return undefined
  const thumbnail = definedString(photo.coverUrl)
  const media = mediaFrom(
    photo.id,
    thumbnail,
    atlasOf(photo.ext_params, photo.extParams),
    candidatesFromVision(photo),
  )
  if (media === undefined) return undefined
  return assemble({
    resource,
    id: photo.id,
    author: authorFor(state.defaultClient, photo.id),
    description: definedString(photo.caption),
    thumbnail,
    publishedAt: publishedAtFrom(photo.timestamp),
    media,
  })
}

function fromInit(
  resource: CanonicalResource,
  state: typeof InitState.Type,
  wanted: string | undefined,
): MediaPost | undefined {
  const entries: Share[] = []
  for (const value of Object.values(state)) {
    const decoded = Schema.decodeUnknownOption(ShareEntry)(value)
    if (!Option.isSome(decoded) || !isPublic(decoded.value.result)) continue
    entries.push(decoded.value)
  }
  const entry = choose(entries, wanted, (item) => item.photo.photoId)
  if (entry === undefined) return undefined
  const photo = entry.photo
  const thumbnail = firstCdnUrl(photo.coverUrls)
  const media = mediaFrom(
    photo.photoId,
    thumbnail,
    atlasOf(photo.ext_params, photo.extParams),
    candidatesFromShare(photo),
  )
  if (media === undefined) return undefined
  return assemble({
    resource,
    id: photo.photoId,
    author: shareAuthor(photo),
    description: definedString(photo.caption),
    thumbnail,
    publishedAt: publishedAtFrom(photo.timestamp),
    media,
  })
}

function candidatesFromVision(photo: Vision): readonly Candidate[] {
  const candidates: Candidate[] = []
  if (photo.manifest !== undefined && photo.manifest !== null) {
    collectManifest(candidates, photo.manifest, 2)
  }
  if (photo.videoResource !== undefined && photo.videoResource !== null) {
    collectVideoResource(candidates, photo.videoResource)
  }
  addPlainUrl(candidates, photo.photoUrl, 2)
  addPlainUrl(candidates, photo.photoH265Url, 1)
  return candidates
}

function candidatesFromShare(photo: Share["photo"]): readonly Candidate[] {
  const candidates: Candidate[] = []
  const urls = photo.mainMvUrls
  if (urls !== undefined && urls !== null) {
    for (const item of urls) addPlainUrl(candidates, item.url, 2)
  }
  return candidates
}

function mediaFrom(
  id: string,
  thumbnail: string | undefined,
  atlas: AtlasState | undefined,
  candidates: readonly Candidate[],
): readonly MediaAsset[] | undefined {
  const images = imageAssets(id, atlas)
  if (images.length > 0) return images
  const video = pickVideo(candidates)
  if (video === undefined) return undefined
  return [videoAsset(id, video, thumbnail)]
}

function imageAssets(
  id: string,
  atlas: AtlasState | undefined,
): readonly ImageAsset[] {
  if (atlas === undefined) return []
  const images: ImageAsset[] = []
  for (let index = 0; index < atlas.list.length; index++) {
    const item = atlas.list[index]
    if (item === undefined) continue
    const url = resolveImage(atlas.cdn[0], item)
    if (url === undefined) continue
    const size = atlas.size?.[index]
    const width = positive(size?.w ?? size?.width)
    const height = positive(size?.h ?? size?.height)
    images.push({
      type: "image",
      id: `${id}:${index}`,
      delivery: deliveryFor(url),
      ...(width === undefined ? {} : { width }),
      ...(height === undefined ? {} : { height }),
    })
  }
  return images
}

function videoAsset(
  id: string,
  chosen: Candidate,
  thumbnail: string | undefined,
): VideoAsset {
  const container = containerOf(chosen.url)
  return {
    type: "video",
    id,
    delivery: deliveryFor(chosen.url),
    ...(chosen.width === undefined ? {} : { width: chosen.width }),
    ...(chosen.height === undefined ? {} : { height: chosen.height }),
    ...(chosen.fps === undefined ? {} : { fps: chosen.fps }),
    ...(chosen.codec === undefined ? {} : { codec: chosen.codec }),
    ...(container === undefined ? {} : { container }),
    ...(chosen.bitrate === undefined ? {} : { bitrate: chosen.bitrate }),
    ...(thumbnail === undefined ? {} : { thumbnail }),
  }
}

// H.264 outranks HEVC. Pixel count then bitrate picks the rendition we keep.
function pickVideo(candidates: readonly Candidate[]): Candidate | undefined {
  let best: Candidate | undefined
  for (const candidate of candidates) {
    if (best === undefined || outranks(candidate, best)) best = candidate
  }
  return best
}

function outranks(next: Candidate, current: Candidate): boolean {
  if (next.codecRank !== current.codecRank) return next.codecRank > current.codecRank
  if (next.pixels !== current.pixels) return next.pixels > current.pixels
  return (next.bitrate ?? 0) > (current.bitrate ?? 0)
}

function collectManifest(
  target: Candidate[],
  manifest: unknown,
  fallbackRank: number,
): void {
  const wrapped = Schema.decodeUnknownOption(WrappedManifest)(manifest)
  if (Option.isSome(wrapped)) {
    addSets(target, wrapped.value.json.adaptationSet, fallbackRank)
    return
  }
  const plain = Schema.decodeUnknownOption(ManifestBody)(manifest)
  if (Option.isSome(plain)) addSets(target, plain.value.adaptationSet, fallbackRank)
}

function collectVideoResource(target: Candidate[], resource: unknown): void {
  const wrapped = Schema.decodeUnknownOption(WrappedVideoResource)(resource)
  const body = Option.isSome(wrapped)
    ? wrapped.value.json
    : plainVideoResource(resource)
  if (body === undefined) return
  addSets(target, body.h264?.adaptationSet, 2)
  addSets(target, body.hevc?.adaptationSet, 1)
  addSets(target, body.adaptationSet, 2)
}

function plainVideoResource(
  resource: unknown,
): typeof VideoResourceJson.Type | undefined {
  const plain = Schema.decodeUnknownOption(VideoResourceJson)(resource)
  return Option.isSome(plain) ? plain.value : undefined
}

function addSets(
  target: Candidate[],
  sets: Manifest["adaptationSet"],
  fallbackRank: number,
): void {
  if (sets === undefined || sets === null) return
  for (const set of sets) {
    const representations = set.representation
    if (representations === undefined || representations === null) continue
    for (const representation of representations) addRepresentation(target, representation, fallbackRank)
  }
}

function addRepresentation(
  target: Candidate[],
  representation: RepresentationState,
  fallbackRank: number,
): void {
  const url = definedString(representation.url)
  if (url === undefined) return
  const codec = definedString(representation.codecs)
  const width = positive(representation.width)
  const height = positive(representation.height)
  const fps = positive(representation.frameRate)
  const bitrate = positive(representation.avgBitrate) ?? positive(representation.maxBitrate)
  target.push({
    url,
    codecRank: codecRank(codec, fallbackRank),
    pixels: (width ?? 0) * (height ?? 0),
    ...(width === undefined ? {} : { width }),
    ...(height === undefined ? {} : { height }),
    ...(fps === undefined ? {} : { fps }),
    ...(codec === undefined ? {} : { codec }),
    ...(bitrate === undefined ? {} : { bitrate }),
  })
}

function addPlainUrl(
  target: Candidate[],
  url: string | null | undefined,
  codecRankValue: number,
): void {
  const playable = definedString(url)
  if (playable === undefined) return
  target.push({ url: playable, codecRank: codecRankValue, pixels: 0 })
}

function codecRank(codec: string | undefined, fallback: number): number {
  if (codec === undefined) return fallback
  const normalized = codec.toLowerCase()
  if (normalized.includes("avc") || normalized.includes("h264")) return 2
  if (normalized.includes("hev") || normalized.includes("h265") || normalized.includes("hvc")) {
    return 1
  }
  return fallback
}

function authorFor(client: Client, photoId: string): Author | undefined {
  const values = clientValues(client)
  for (const value of values) {
    const detail = Schema.decodeUnknownOption(Detail)(value)
    if (Option.isNone(detail) || !detailMatches(detail.value, photoId)) continue
    const linked = authorFromDetail(client, detail.value)
    if (linked !== undefined) return linked
  }
  const authors: AuthorEntity[] = []
  for (const value of values) {
    const decoded = Schema.decodeUnknownOption(VisionAuthorEntity)(value)
    if (Option.isSome(decoded)) authors.push(decoded.value)
  }
  const only = authors.length === 1 ? authors[0] : undefined
  return only === undefined ? undefined : authorFromEntity(only)
}

function authorFromDetail(client: Client, detail: DetailState): Author | undefined {
  const author = detail.author
  if (author === undefined || author === null) return undefined
  if ("__ref" in author) {
    const raw = client[author.__ref]
    if (raw === undefined) return undefined
    const decoded = Schema.decodeUnknownOption(VisionAuthorEntity)(raw)
    return Option.isSome(decoded) ? authorFromEntity(decoded.value) : undefined
  }
  return authorFromEntity(author)
}

function detailMatches(detail: DetailState, photoId: string): boolean {
  const photo = detail.photo
  if (photo === undefined || photo === null) return false
  if ("__ref" in photo) return photo.__ref.endsWith(`:${photoId}`)
  return photo.id === photoId
}

function authorFromEntity(entity: AuthorEntity): Author | undefined {
  return authorOf(
    definedString(entity.id),
    definedString(entity.name),
    definedString(entity.headerUrl),
  )
}

function shareAuthor(photo: Share["photo"]): Author | undefined {
  // userEid is the public profile id. userId is the internal numeric id.
  return authorOf(
    definedString(photo.userEid) ?? textId(photo.userId),
    definedString(photo.userName),
    definedString(photo.headUrl),
  )
}

function authorOf(
  id: string | undefined,
  name: string | undefined,
  avatar: string | undefined,
): Author | undefined {
  if (id === undefined && name === undefined && avatar === undefined) return undefined
  return {
    ...(id === undefined ? {} : { id }),
    ...(name === undefined ? {} : { name }),
    ...(avatar === undefined ? {} : { avatar }),
  }
}

function assemble(input: {
  readonly resource: CanonicalResource
  readonly id: string
  readonly author: Author | undefined
  readonly description: string | undefined
  readonly thumbnail: string | undefined
  readonly publishedAt: string | undefined
  readonly media: readonly MediaAsset[]
}): MediaPost {
  return {
    platform: "kuaishou",
    id: input.id,
    canonicalUrl: input.resource.url.href,
    ...(input.author === undefined ? {} : { author: input.author }),
    ...(input.description === undefined ? {} : { description: input.description }),
    ...(input.thumbnail === undefined ? {} : { thumbnail: input.thumbnail }),
    ...(input.publishedAt === undefined ? {} : { publishedAt: input.publishedAt }),
    media: input.media,
  }
}

function atlasOf(
  snake: Vision["ext_params"],
  camel: Vision["extParams"],
): AtlasState | undefined {
  const atlas = readAtlas(snake) ?? readAtlas(camel)
  if (atlas === undefined || atlas.list.length === 0) return undefined
  return atlas
}

function readAtlas(params: Vision["ext_params"]): AtlasState | undefined {
  if (params === undefined || params === null) return undefined
  const atlas = params.atlas
  if (atlas === undefined || atlas === null) return undefined
  return atlas
}

function resolveImage(cdn: string | undefined, item: string): string | undefined {
  if (item.startsWith("https://") || item.startsWith("http://")) return item
  if (cdn === undefined || cdn.length === 0) return undefined
  const host = cdn.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/\/$/, "")
  const path = item.replace(/^\//, "")
  if (host.length === 0 || path.length === 0) return undefined
  return `https://${host}/${path}`
}

function firstCdnUrl(
  urls: readonly { readonly url: string }[] | null | undefined,
): string | undefined {
  return definedString(urls?.[0]?.url)
}

function deliveryFor(url: string): Delivery {
  if (needsReferer(url)) {
    // The Kuaishou CDN expects its own Referer. Keep the upstream URL here. It is signed into a token before the page sees it.
    return unsignedProxy(url, { Referer: "https://www.kuaishou.com/" })
  }
  return { type: "direct", url }
}

function needsReferer(rawUrl: string): boolean {
  let hostname: string
  try {
    hostname = new URL(rawUrl).hostname
  } catch {
    return true
  }
  return refererHostSuffixes.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  )
}

function containerOf(rawUrl: string): "mp4" | "webm" | undefined {
  let path: string
  try {
    path = new URL(rawUrl).pathname.toLowerCase()
  } catch {
    return undefined
  }
  if (path.endsWith(".mp4")) return "mp4"
  if (path.endsWith(".webm")) return "webm"
  return undefined
}

function publishedAtFrom(timestamp: number | null | undefined): string | undefined {
  if (timestamp === undefined || timestamp === null || !Number.isFinite(timestamp) || timestamp <= 0) {
    return undefined
  }
  // Current pages use unix milliseconds. Older share payloads use seconds.
  const milliseconds = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp
  const date = new Date(milliseconds)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}

function isPublic(result: number | null | undefined): boolean {
  return result === undefined || result === null || result === 1
}

function choose<T>(
  items: readonly T[],
  wanted: string | undefined,
  idOf: (item: T) => string,
): T | undefined {
  if (wanted !== undefined) {
    const matched = items.find((item) => idOf(item) === wanted)
    if (matched !== undefined) return matched
  }
  return items[0]
}

function clientValues(client: Client): readonly unknown[] {
  const values: unknown[] = []
  for (const value of Object.values(client)) {
    values.push(value)
    for (const nested of nestedValues(value)) values.push(nested)
  }
  return values
}

function nestedValues(value: unknown): readonly unknown[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return []
  const values: unknown[] = Object.values(value)
  return values.filter((nested) => nested !== undefined)
}

function textId(value: string | number | null | undefined): string | undefined {
  if (typeof value === "string" && value.length > 0) return value
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value))
  return undefined
}

function definedString(value: string | null | undefined): string | undefined {
  if (value === undefined || value === null || value.length === 0) return undefined
  return value
}

function positive(value: number | null | undefined): number | undefined {
  if (value === undefined || value === null || !Number.isFinite(value) || value <= 0) return undefined
  return value
}
