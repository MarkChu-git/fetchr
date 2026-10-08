import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { decodePng, parsePng, rgbaAt } from "../scripts/og/png"
import { shareAssets } from "./share-assets.gen"

/** The committed files, read the way a visitor's request would reach them: by the path the page uses. */
function committed(path: string): Uint8Array {
  return readFileSync(fileURLToPath(new URL(`../public${path}`, import.meta.url)))
}

const sha8 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex").slice(0, 8)

const shareImages = [shareAssets.ogZh, shareAssets.ogEn, shareAssets.square] as const
const everyImage = [...shareImages, shareAssets.favicon32, shareAssets.appleTouchIcon] as const

test("every recorded version is the first eight hex digits of the file's content hash", () => {
  for (const image of everyImage) {
    const recorded: string = image.version
    expect(recorded, image.path).toBe(sha8(committed(image.path)))
  }
})

test("every committed PNG is the size the record names", () => {
  for (const image of everyImage) {
    const info = parsePng(committed(image.path))
    expect([info.width, info.height], image.path).toEqual([image.width, image.height])
  }
})

test("the share images are indexed, within 64 colours and within their size limits", () => {
  for (const image of shareImages) {
    const bytes = committed(image.path)
    const info = parsePng(bytes)
    expect(info.colorType, `${image.path} colour type`).toBe(3)
    expect(info.palette.length, `${image.path} palette`).toBeLessThanOrEqual(64)
    expect(bytes.length, `${image.path} size`).toBeLessThanOrEqual(image === shareAssets.square ? 8 * 1024 : 25 * 1024)
  }
})

test("the share images are served under /share/ and the icons where the page links them", () => {
  for (const image of shareImages) expect(image.path).toMatch(/^\/share\/[a-z-]+\.png$/)
  expect(shareAssets.favicon32.path).toBe("/favicon-32.png")
  expect(shareAssets.appleTouchIcon.path).toBe("/apple-touch-icon.png")
})

test("favicon-32.png keeps an alpha channel and transparent corners", () => {
  const png = decodePng(committed(shareAssets.favicon32.path))
  expect(png.colorType).toBe(6)
  expect(rgbaAt(png, 0, 0)[3]).toBe(0)
  expect(rgbaAt(png, 31, 31)[3]).toBe(0)
  expect(rgbaAt(png, 16, 16)[3]).toBe(255)
})

test("apple-touch-icon.png is an opaque ink square with no transparent pixel", () => {
  const png = decodePng(committed(shareAssets.appleTouchIcon.path))
  for (const [x, y] of [
    [0, 0],
    [179, 0],
    [0, 179],
    [179, 179],
  ] as const) {
    expect(rgbaAt(png, x, y), `corner ${x},${y}`).toEqual([0x25, 0x25, 0x2a, 255])
  }
  let transparent = 0
  for (let i = 3; i < png.data.length; i += 4) {
    if (png.data[i] !== 255) transparent += 1
  }
  expect(transparent).toBe(0)
})
