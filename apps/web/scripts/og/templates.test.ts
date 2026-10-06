import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { pageCopy } from "../../src/i18n.ts"
import { loadFonts } from "./font-store.ts"
import type { Rgba } from "./png.ts"
import { drawSvg, rasterizeRgba } from "./render.ts"
import { locales } from "./share-texts.ts"
import { ogCard, squareCard, svgDataUri, type CardInput } from "./templates.ts"

const fontsDir = fileURLToPath(new URL("./fonts/", import.meta.url))
const logoSvg = readFileSync(fileURLToPath(new URL("../../public/logo.svg", import.meta.url)), "utf8")
const fonts = loadFonts(fontsDir)
const logo = svgDataUri(logoSvg)

const PAPER = [0xf3, 0xf3, 0xf5] as const
const INK = [0x25, 0x25, 0x2a] as const
const WHITE = [0xff, 0xff, 0xff] as const
const ACCENT = [0xe9, 0x59, 0x2a] as const

const inputFor = (locale: (typeof locales)[number]): CardInput => ({ copy: pageCopy(locale), stack: fonts.stack, logo })

function colorAt(image: Rgba, x: number, y: number): readonly [number, number, number] {
  const o = (y * image.width + x) * 4
  return [image.pixels[o] ?? 0, image.pixels[o + 1] ?? 0, image.pixels[o + 2] ?? 0]
}

const is = (color: readonly [number, number, number], expected: readonly [number, number, number]): boolean =>
  color[0] === expected[0] && color[1] === expected[1] && color[2] === expected[2]

function countColor(image: Rgba, expected: readonly [number, number, number], area?: { x0: number; y0: number; x1: number; y1: number }): number {
  const { x0, y0, x1, y1 } = area ?? { x0: 0, y0: 0, x1: image.width, y1: image.height }
  let count = 0
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) if (is(colorAt(image, x, y), expected)) count += 1
  }
  return count
}

/**
 * The box around every pixel that is not (nearly) the background colour. Where the logo's ink tile meets the
 * ink canvas, edge blending leaves pixels one level off; they are background, not content.
 */
function contentBox(image: Rgba, background: readonly [number, number, number]): { top: number; bottom: number; left: number; right: number } {
  let top = image.height
  let bottom = -1
  let left = image.width
  let right = -1
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const [r, g, b] = colorAt(image, x, y)
      if (Math.abs(r - background[0]) <= 3 && Math.abs(g - background[1]) <= 3 && Math.abs(b - background[2]) <= 3) continue
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
      left = Math.min(left, x)
      right = Math.max(right, x)
    }
  }
  return { top, bottom, left, right }
}

interface Node {
  readonly type: unknown
  readonly props: { readonly style?: Record<string, unknown>; readonly children?: unknown }
}

function* walk(node: unknown): Generator<Node> {
  if (typeof node !== "object" || node === null || !("props" in node)) return
  yield node as Node
  const children = (node as Node).props.children
  for (const child of Array.isArray(children) ? children : [children]) yield* walk(child)
}

test("the wide card carries the page copy, and changing the copy changes the card", () => {
  for (const locale of locales) {
    const copy = pageCopy(locale)
    const json = JSON.stringify(ogCard(inputFor(locale)))
    for (const text of [copy.shareHeadline, copy.pasteLabel, copy.submit, ...copy.platforms]) {
      expect(json, `${locale} card must show "${text}"`).toContain(JSON.stringify(text).slice(1, -1))
    }
  }
  const changed = JSON.stringify(ogCard({ ...inputFor("zh"), copy: { ...pageCopy("zh"), shareHeadline: "换一句大标题" } }))
  expect(changed).toContain("换一句大标题")
  expect(changed).not.toContain(pageCopy("zh").shareHeadline)
})

test("every element is something Satori accepts: no empty children arrays, multi-child elements are flex", () => {
  for (const tree of [ogCard(inputFor("zh")), ogCard(inputFor("en")), squareCard({ logo })]) {
    for (const node of walk(tree)) {
      const children = node.props.children
      expect(Array.isArray(children) && children.length === 0, "an element must omit children instead of passing []").toBe(false)
      if (Array.isArray(children) && children.length > 1) {
        expect(["flex", "contents", "none"]).toContain(node.props.style?.display as string)
      }
    }
  }
})

test("the wide card renders at 1200x630 in both locales with the brand colours in the right places", async () => {
  for (const locale of locales) {
    const image = await rasterizeRgba(await drawSvg(ogCard(inputFor(locale)), 1200, 630, fonts))
    expect([image.width, image.height]).toEqual([1200, 630])
    expect(colorAt(image, 2, 2), `${locale} background`).toEqual([...PAPER])
    expect(countColor(image, WHITE), `${locale} card fill`).toBeGreaterThan(100_000)
    expect(countColor(image, INK), `${locale} button and text`).toBeGreaterThan(5_000)
    expect(countColor(image, ACCENT), `${locale} logo dot`).toBeGreaterThan(20)
  }
})

test("the wide card keeps clear of the edges and sits vertically centred", async () => {
  for (const locale of locales) {
    const image = await rasterizeRgba(await drawSvg(ogCard(inputFor(locale)), 1200, 630, fonts))
    const box = contentBox(image, PAPER)
    expect(box.left, `${locale} left margin`).toBeGreaterThanOrEqual(60)
    expect(image.width - 1 - box.right, `${locale} right margin`).toBeGreaterThanOrEqual(60)
    expect(box.top, `${locale} top margin`).toBeGreaterThanOrEqual(40)
    expect(Math.abs(box.top - (image.height - 1 - box.bottom)), `${locale} top and bottom margins`).toBeLessThanOrEqual(6)
  }
})

test("the square card is an ink square with the F, the dot and the wordmark where the design puts them", async () => {
  const image = await rasterizeRgba(await drawSvg(squareCard({ logo }), 600, 600, fonts))
  expect([image.width, image.height]).toEqual([600, 600])
  expect(colorAt(image, 2, 2)).toEqual([...INK])
  expect(colorAt(image, 597, 597)).toEqual([...INK])
  expect(colorAt(image, 237, 225), "inside the F's stem").toEqual([...PAPER])
  expect(colorAt(image, 353, 340), "the dot's centre").toEqual([...ACCENT])
  expect(countColor(image, PAPER, { x0: 0, y0: 410, x1: 600, y1: 540 }), "the wordmark").toBeGreaterThan(1_500)
  const box = contentBox(image, INK)
  expect(Math.abs(box.top - (image.height - 1 - box.bottom)), "top and bottom margins").toBeLessThanOrEqual(8)
})
