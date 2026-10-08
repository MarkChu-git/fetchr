import { expect, test } from "bun:test"
import { deflateSync } from "node:zlib"
import { decodePng, encodeIndexedPng, parsePng, quantize, rgbaAt, type Rgb, type Rgba } from "./png.ts"

const INK: Rgb = [0x25, 0x25, 0x2a]
const PAPER: Rgb = [0xf3, 0xf3, 0xf5]
const WHITE: Rgb = [0xff, 0xff, 0xff]
const ACCENT: Rgb = [0xe9, 0x59, 0x2a]
const BRAND = ["#25252a", "#f3f3f5", "#ffffff", "#e9592a"] as const
const OPTIONS = { maxColors: 64, pinned: BRAND } as const

const lerp = (a: number, b: number, t: number): number => Math.round(a + (b - a) * t)
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
const same = (a: Rgb, b: Rgb): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2]

interface SyntheticOptions {
  readonly accent: boolean
}

/**
 * A 240x120 stand-in for a share card: paper background, a white card, an ink button,
 * an anti-aliased accent dot and a smooth ink-to-paper strip so the image has far more than 64 colours.
 */
function synthetic({ accent }: SyntheticOptions = { accent: true }): Rgba {
  const width = 240
  const height = 120
  const pixels = new Uint8Array(width * height * 4)
  const put = (x: number, y: number, [r, g, b]: Rgb): void => {
    const o = (y * width + x) * 4
    pixels[o] = r
    pixels[o + 1] = g
    pixels[o + 2] = b
    pixels[o + 3] = 255
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let color = PAPER
      if (x >= 10 && x < 230 && y >= 10 && y < 110) color = WHITE
      if (x >= 150 && x < 220 && y >= 80 && y < 100) color = INK
      if (y >= 20 && y < 30 && x >= 20 && x < 220) color = mix(INK, PAPER, (x - 20) / 200)
      if (accent) {
        const distance = Math.hypot(x - 40, y - 60)
        const coverage = Math.min(1, Math.max(0, 14 + 0.5 - distance))
        if (coverage > 0) color = mix(color, ACCENT, coverage)
      }
      put(x, y, color)
    }
  }
  return { width, height, pixels }
}

function uniqueColors(image: Rgba): number {
  const seen = new Set<number>()
  for (let i = 0; i < image.pixels.length; i += 4) {
    seen.add(((image.pixels[i] ?? 0) << 16) | ((image.pixels[i + 1] ?? 0) << 8) | (image.pixels[i + 2] ?? 0))
  }
  return seen.size
}

test("keeps every brand colour that appears in the image, exactly", () => {
  const image = synthetic()
  expect(uniqueColors(image)).toBeGreaterThan(64)
  const q = quantize(image, OPTIONS)
  expect(q.palette.length).toBeLessThanOrEqual(64)
  for (const color of [INK, PAPER, WHITE, ACCENT]) {
    expect(
      q.palette.some((entry) => same(entry, color)),
      `palette must hold ${color.join(",")}`,
    ).toBe(true)
  }
})

test("does not add a pinned colour that the image never uses", () => {
  const q = quantize(synthetic({ accent: false }), OPTIONS)
  expect(q.palette.some((entry) => same(entry, ACCENT))).toBe(false)
})

test("is lossless when the image already fits the palette", () => {
  const pixels = new Uint8Array(4 * 2 * 4)
  for (let i = 0; i < 8; i += 1) {
    const [r, g, b] = i % 2 === 0 ? INK : PAPER
    pixels.set([r, g, b, 255], i * 4)
  }
  const q = quantize({ width: 4, height: 2, pixels }, OPTIONS)
  expect(q.palette).toHaveLength(2)
  const back = decodePng(encodeIndexedPng(q))
  for (let i = 0; i < 8; i += 1) {
    const [r, g, b] = i % 2 === 0 ? INK : PAPER
    expect(rgbaAt(back, i % 4, Math.floor(i / 4))).toEqual([r, g, b, 255])
  }
})

test("keeps flat regions exact and the average error small", () => {
  const image = synthetic()
  const decoded = decodePng(encodeIndexedPng(quantize(image, OPTIONS)))
  let total = 0
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const o = (y * image.width + x) * 4
      const [r, g, b] = rgbaAt(decoded, x, y)
      total += Math.abs(r - (image.pixels[o] ?? 0)) + Math.abs(g - (image.pixels[o + 1] ?? 0)) + Math.abs(b - (image.pixels[o + 2] ?? 0))
    }
  }
  expect(total / (image.width * image.height * 3)).toBeLessThan(1.5)
  expect(rgbaAt(decoded, 5, 5)).toEqual([...PAPER, 255])
  expect(rgbaAt(decoded, 100, 70)).toEqual([...WHITE, 255])
  expect(rgbaAt(decoded, 200, 90)).toEqual([...INK, 255])
  expect(rgbaAt(decoded, 40, 60)).toEqual([...ACCENT, 255])
})

test("writes a well-formed 8-bit indexed PNG", () => {
  const info = parsePng(encodeIndexedPng(quantize(synthetic(), OPTIONS)))
  expect([info.width, info.height]).toEqual([240, 120])
  expect(info.bitDepth).toBe(8)
  expect(info.colorType).toBe(3)
  expect(info.interlace).toBe(0)
  const types = info.chunks.map((chunk) => chunk.type)
  expect(types[0]).toBe("IHDR")
  expect(types[1]).toBe("PLTE")
  expect(types.at(-1)).toBe("IEND")
  expect(types.slice(2, -1).every((type) => type === "IDAT")).toBe(true)
  expect(info.palette.length).toBeLessThanOrEqual(64)
})

test("parsePng rejects a chunk whose CRC does not match", () => {
  const bytes = encodeIndexedPng(quantize(synthetic(), OPTIONS))
  const bad = bytes.slice()
  bad[20] = (bad[20] ?? 0) ^ 0xff
  expect(() => parsePng(bad)).toThrow(/crc/i)
})

test("decoding the PNG returns the quantized indices and palette", () => {
  const q = quantize(synthetic(), OPTIONS)
  const decoded = decodePng(encodeIndexedPng(q))
  expect(decoded.colorType).toBe(3)
  expect(decoded.palette).toEqual(q.palette)
  expect(decoded.data).toEqual(q.indices)
})

test("is much smaller than the same image stored as RGBA", () => {
  const image = synthetic()
  const rowBytes = image.width * 4
  const raw = new Uint8Array(image.height * (rowBytes + 1))
  for (let y = 0; y < image.height; y += 1) {
    raw.set(image.pixels.subarray(y * rowBytes, (y + 1) * rowBytes), y * (rowBytes + 1) + 1)
  }
  const rgbaSize = deflateSync(raw, { level: 9 }).length
  expect(encodeIndexedPng(quantize(image, OPTIONS)).length).toBeLessThan(rgbaSize * 0.6)
})

test("produces identical bytes for identical input", () => {
  const a = encodeIndexedPng(quantize(synthetic(), OPTIONS))
  const b = encodeIndexedPng(quantize(synthetic(), OPTIONS))
  expect(a).toEqual(b)
})

test("rejects a pixel that is not opaque", () => {
  const image = synthetic()
  image.pixels[3] = 128
  expect(() => quantize(image, OPTIONS)).toThrow(/opaque/)
})

test("never exceeds the palette limit, however many colours the image has", () => {
  const width = 64
  const height = 64
  const pixels = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      pixels.set([(x * 4) % 256, (y * 4) % 256, ((x + y) * 2) % 256, 255], (y * width + x) * 4)
    }
  }
  const image = { width, height, pixels }
  expect(uniqueColors(image)).toBeGreaterThan(1000)
  expect(quantize(image, OPTIONS).palette.length).toBeLessThanOrEqual(64)
})

test("fails instead of dropping a pinned colour when the palette cannot hold them", () => {
  const colors: Rgb[] = [INK, PAPER, WHITE, ACCENT, [1, 2, 3]]
  const pixels = new Uint8Array(colors.length * 4)
  colors.forEach(([r, g, b], i) => pixels.set([r, g, b, 255], i * 4))
  expect(() => quantize({ width: colors.length, height: 1, pixels }, { maxColors: 4, pinned: BRAND })).toThrow(/palette/i)
})
