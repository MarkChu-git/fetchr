/**
 * Palette quantizer and indexed-PNG codec for the share images.
 *
 * Build-time only (apps/web/scripts is not shipped source). The quantizer pins the brand colours so a
 * general-purpose palette cut cannot merge them into their neighbours: white (#ffffff) and paper (#f3f3f5)
 * differ by a hair, and a generic quantizer folds one into the other.
 */
import { deflateSync, inflateSync } from "node:zlib"

export type Rgb = readonly [number, number, number]

export interface Rgba {
  readonly width: number
  readonly height: number
  /** RGBA, 8 bits per channel, row-major, not premultiplied. */
  readonly pixels: Uint8Array
}

export interface QuantizeOptions {
  readonly maxColors: number
  /** Colours that must survive exactly, as `#rrggbb`. Only the ones the image uses get a palette entry. */
  readonly pinned: readonly string[]
}

export interface Quantized {
  readonly width: number
  readonly height: number
  readonly palette: readonly Rgb[]
  /** One palette index per pixel, row-major. */
  readonly indices: Uint8Array
}

interface Counted {
  readonly key: number
  readonly r: number
  readonly g: number
  readonly b: number
  readonly count: number
}

type Channel = 0 | 1 | 2

const pack = (r: number, g: number, b: number): number => (r << 16) | (g << 8) | b
const unpack = (key: number): Rgb => [(key >> 16) & 255, (key >> 8) & 255, key & 255]

function parseHex(hex: string): number {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`pinned colour ${hex} is not #rrggbb`)
  return Number.parseInt(hex.slice(1), 16)
}

function countColors({ width, height, pixels }: Rgba): Map<number, number> {
  if (pixels.length !== width * height * 4) {
    throw new Error(`expected ${width * height * 4} RGBA bytes for ${width}x${height}, got ${pixels.length}`)
  }
  const counts = new Map<number, number>()
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] !== 255) throw new Error(`pixel ${i / 4} is not opaque; share images must be opaque`)
    const key = pack(pixels[i] ?? 0, pixels[i + 1] ?? 0, pixels[i + 2] ?? 0)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

function channelOf(color: Counted, channel: Channel): number {
  if (channel === 0) return color.r
  return channel === 1 ? color.g : color.b
}

function widestChannel(colors: readonly Counted[]): { readonly channel: Channel; readonly range: number } {
  let best: { readonly channel: Channel; readonly range: number } = { channel: 0, range: -1 }
  for (const channel of [0, 1, 2] as const) {
    let low = 255
    let high = 0
    for (const color of colors) {
      const value = channelOf(color, channel)
      if (value < low) low = value
      if (value > high) high = value
    }
    if (high - low > best.range) best = { channel, range: high - low }
  }
  return best
}

/** Split at the population-weighted median along the widest channel. Both halves are non-empty. */
function splitBucket(colors: readonly Counted[]): readonly [Counted[], Counted[]] {
  const { channel } = widestChannel(colors)
  const sorted = [...colors].sort((a, b) => channelOf(a, channel) - channelOf(b, channel) || a.key - b.key)
  const total = sorted.reduce((sum, color) => sum + color.count, 0)
  let running = 0
  let cut = sorted.length - 1
  for (let i = 0; i < sorted.length - 1; i += 1) {
    running += sorted[i]?.count ?? 0
    if (running * 2 >= total) {
      cut = i + 1
      break
    }
  }
  return [sorted.slice(0, cut), sorted.slice(cut)]
}

function weightedMean(bucket: readonly Counted[]): Rgb {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (const color of bucket) {
    r += color.r * color.count
    g += color.g * color.count
    b += color.b * color.count
    n += color.count
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)]
}

function medianCut(colors: readonly Counted[], target: number): Rgb[] {
  let buckets: Counted[][] = [[...colors]]
  while (buckets.length < target) {
    let pick = -1
    let pickRange = 0
    for (let i = 0; i < buckets.length; i += 1) {
      const bucket = buckets[i]
      if (bucket === undefined || bucket.length < 2) continue
      const { range } = widestChannel(bucket)
      if (range > pickRange) {
        pick = i
        pickRange = range
      }
    }
    const chosen = buckets[pick]
    if (chosen === undefined) break
    const [low, high] = splitBucket(chosen)
    buckets = [...buckets.slice(0, pick), low, high, ...buckets.slice(pick + 1)]
  }
  return buckets.map(weightedMean)
}

export function quantize(image: Rgba, options: QuantizeOptions): Quantized {
  const { maxColors } = options
  if (!Number.isInteger(maxColors) || maxColors < 1 || maxColors > 256) {
    throw new Error(`maxColors must be an integer from 1 to 256, got ${maxColors}`)
  }
  const counts = countColors(image)
  const pinnedKeys = [...new Set(options.pinned.map(parseHex))].filter((key) => counts.has(key))
  const pinnedSet = new Set(pinnedKeys)
  const rest: Counted[] = []
  for (const [key, count] of counts) {
    if (pinnedSet.has(key)) continue
    const [r, g, b] = unpack(key)
    rest.push({ key, r, g, b, count })
  }
  const room = maxColors - pinnedKeys.length
  if (room < 0 || (room === 0 && rest.length > 0)) {
    throw new Error(
      `the palette limit of ${maxColors} cannot hold the ${pinnedKeys.length} pinned colours plus the ${rest.length} other colours in the image`,
    )
  }
  const others: Rgb[] = rest.length <= room ? rest.map(({ r, g, b }): Rgb => [r, g, b]) : medianCut(rest, room)

  const palette: Rgb[] = []
  const inPalette = new Set<number>()
  for (const rgb of [...pinnedKeys.map(unpack), ...others]) {
    const key = pack(rgb[0], rgb[1], rgb[2])
    if (inPalette.has(key)) continue
    inPalette.add(key)
    palette.push(rgb)
  }

  const nearestCache = new Map<number, number>()
  const nearest = (key: number): number => {
    const cached = nearestCache.get(key)
    if (cached !== undefined) return cached
    const [r, g, b] = unpack(key)
    let best = 0
    let bestDistance = Number.POSITIVE_INFINITY
    for (let i = 0; i < palette.length; i += 1) {
      const entry = palette[i] ?? [0, 0, 0]
      const distance = (entry[0] - r) ** 2 + (entry[1] - g) ** 2 + (entry[2] - b) ** 2
      if (distance < bestDistance) {
        best = i
        bestDistance = distance
      }
    }
    nearestCache.set(key, best)
    return best
  }

  const { width, height, pixels } = image
  const indices = new Uint8Array(width * height)
  for (let p = 0; p < indices.length; p += 1) {
    indices[p] = nearest(pack(pixels[p * 4] ?? 0, pixels[p * 4 + 1] ?? 0, pixels[p * 4 + 2] ?? 0))
  }
  return { width, height, palette, indices }
}

// ---------------------------------------------------------------- PNG container

const SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)

const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(parts: readonly Uint8Array[]): number {
  let crc = 0xffffffff
  for (const part of parts) {
    for (const byte of part) crc = (CRC_TABLE[(crc ^ byte) & 255] ?? 0) ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

const textEncoder = new TextEncoder()

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = textEncoder.encode(type)
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(typeBytes, 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32([typeBytes, data]))
  return out
}

function paeth(left: number, up: number, upLeft: number): number {
  const p = left + up - upLeft
  const pa = Math.abs(p - left)
  const pb = Math.abs(p - up)
  const pc = Math.abs(p - upLeft)
  if (pa <= pb && pa <= pc) return left
  return pb <= pc ? up : upLeft
}

function predict(type: number, left: number, up: number, upLeft: number): number {
  if (type === 1) return left
  if (type === 2) return up
  if (type === 3) return Math.floor((left + up) / 2)
  return type === 4 ? paeth(left, up, upLeft) : 0
}

/**
 * Rows go in unfiltered (filter type 0). The PNG filters predict a byte from its neighbours' values, which means
 * nothing for palette indices, and measured on the share cards the best adaptive choice came out 22 to 24 percent
 * larger than leaving the rows alone (wide card 20.5 KB against 16.0 KB).
 */
function unfilteredRows(indices: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(height * (width + 1))
  for (let y = 0; y < height; y += 1) out.set(indices.subarray(y * width, (y + 1) * width), y * (width + 1) + 1)
  return out
}

/** Encode palette indices as an 8-bit indexed-colour PNG (colour type 3, no interlace). */
export function encodeIndexedPng({ width, height, palette, indices }: Quantized): Uint8Array {
  if (palette.length < 1 || palette.length > 256) throw new Error(`palette must hold 1 to 256 colours, got ${palette.length}`)
  if (indices.length !== width * height) throw new Error(`expected ${width * height} indices, got ${indices.length}`)
  for (const index of indices) {
    if (index >= palette.length) throw new Error(`palette index ${index} is outside the ${palette.length}-entry palette`)
  }
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdr[8] = 8
  ihdr[9] = 3
  const plte = new Uint8Array(palette.length * 3)
  palette.forEach(([r, g, b], i) => plte.set([r, g, b], i * 3))
  const idat = deflateSync(unfilteredRows(indices, width, height), { level: 9 })
  return concat([SIGNATURE, chunk("IHDR", ihdr), chunk("PLTE", plte), chunk("IDAT", idat), chunk("IEND", new Uint8Array())])
}

// ---------------------------------------------------------------- reading (tests and self-checks)

interface PngChunk {
  readonly type: string
  readonly data: Uint8Array
}

export interface PngInfo {
  readonly width: number
  readonly height: number
  readonly bitDepth: number
  readonly colorType: number
  readonly interlace: number
  readonly chunks: readonly PngChunk[]
  readonly palette: readonly Rgb[]
}

/** Read the container: signature, chunk framing and every CRC. Throws on anything malformed. */
export function parsePng(bytes: Uint8Array): PngInfo {
  if (bytes.length < SIGNATURE.length || SIGNATURE.some((byte, i) => bytes[i] !== byte)) throw new Error("not a PNG: bad signature")
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const chunks: PngChunk[] = []
  let offset = SIGNATURE.length
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error("PNG ends inside a chunk header")
    const length = view.getUint32(offset)
    const typeBytes = bytes.subarray(offset + 4, offset + 8)
    const type = String.fromCharCode(...typeBytes)
    const end = offset + 8 + length
    if (end + 4 > bytes.length) throw new Error(`${type} chunk runs past the end of the file`)
    const data = bytes.subarray(offset + 8, end)
    if (view.getUint32(end) !== crc32([typeBytes, data])) throw new Error(`CRC mismatch in ${type} chunk`)
    chunks.push({ type, data })
    offset = end + 4
  }
  const header = chunks[0]
  if (header?.type !== "IHDR" || header.data.length !== 13) throw new Error("PNG must start with a 13-byte IHDR")
  if (chunks.at(-1)?.type !== "IEND") throw new Error("PNG must end with IEND")
  const ihdr = new DataView(header.data.buffer, header.data.byteOffset, header.data.byteLength)
  const palette: Rgb[] = []
  const plte = chunks.find((c) => c.type === "PLTE")
  if (plte !== undefined) {
    if (plte.data.length % 3 !== 0) throw new Error("PLTE length is not a multiple of 3")
    for (let i = 0; i < plte.data.length; i += 3) palette.push([plte.data[i] ?? 0, plte.data[i + 1] ?? 0, plte.data[i + 2] ?? 0])
  }
  return {
    width: ihdr.getUint32(0),
    height: ihdr.getUint32(4),
    bitDepth: ihdr.getUint8(8),
    colorType: ihdr.getUint8(9),
    interlace: ihdr.getUint8(12),
    chunks,
    palette,
  }
}

export interface DecodedPng {
  readonly width: number
  readonly height: number
  readonly colorType: 2 | 3 | 6
  readonly channels: 1 | 3 | 4
  readonly palette: readonly Rgb[]
  /** Unfiltered scanline bytes without the filter-type bytes: indices for colour type 3, interleaved channels otherwise. */
  readonly data: Uint8Array
}

/** Decode 8-bit, non-interlaced PNGs of colour type 2, 3 or 6. */
export function decodePng(bytes: Uint8Array): DecodedPng {
  const info = parsePng(bytes)
  if (info.bitDepth !== 8 || info.interlace !== 0) throw new Error("only 8-bit, non-interlaced PNG is supported")
  let colorType: 2 | 3 | 6
  let channels: 1 | 3 | 4
  if (info.colorType === 3) {
    colorType = 3
    channels = 1
  } else if (info.colorType === 2) {
    colorType = 2
    channels = 3
  } else if (info.colorType === 6) {
    colorType = 6
    channels = 4
  } else {
    throw new Error(`unsupported PNG colour type ${info.colorType}`)
  }
  const raw = inflateSync(concat(info.chunks.filter((c) => c.type === "IDAT").map((c) => c.data)))
  const stride = info.width * channels
  if (raw.length !== info.height * (stride + 1)) throw new Error("PNG image data has the wrong length")
  const data = new Uint8Array(info.height * stride)
  for (let y = 0; y < info.height; y += 1) {
    const type = raw[y * (stride + 1)] ?? 0
    if (type > 4) throw new Error(`unknown PNG filter type ${type}`)
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? (data[y * stride + x - channels] ?? 0) : 0
      const up = y > 0 ? (data[(y - 1) * stride + x] ?? 0) : 0
      const upLeft = y > 0 && x >= channels ? (data[(y - 1) * stride + x - channels] ?? 0) : 0
      data[y * stride + x] = ((raw[y * (stride + 1) + 1 + x] ?? 0) + predict(type, left, up, upLeft)) & 255
    }
  }
  return { width: info.width, height: info.height, colorType, channels, palette: info.palette, data }
}

export function rgbaAt(png: DecodedPng, x: number, y: number): readonly [number, number, number, number] {
  const o = (y * png.width + x) * png.channels
  if (png.colorType === 3) {
    const [r, g, b] = png.palette[png.data[o] ?? 0] ?? [0, 0, 0]
    return [r, g, b, 255]
  }
  return [png.data[o] ?? 0, png.data[o + 1] ?? 0, png.data[o + 2] ?? 0, png.colorType === 6 ? (png.data[o + 3] ?? 0) : 255]
}
