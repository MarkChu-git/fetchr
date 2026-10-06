import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const INK = "#25252a"
const PAPER = "#f3f3f5"
const INK_DARK = "#17171b"
const ACCENT = "#e9592a"

function readPublic(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../public/${name}`, import.meta.url)), "utf8")
}

interface Shape {
  readonly tag: "rect" | "circle"
  readonly attrs: Readonly<Record<string, string>>
}

/** The two logo files hold plain rect and circle elements, so a small scan is enough. */
function shapes(svg: string): Shape[] {
  const found: Shape[] = []
  for (const match of svg.matchAll(/<(rect|circle)\b([^>]*?)\/?>/g)) {
    const tag = match[1]
    if (tag !== "rect" && tag !== "circle") continue
    const attrs: Record<string, string> = {}
    for (const attr of (match[2] ?? "").matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) {
      const key = attr[1]
      const value = attr[2]
      if (key !== undefined && value !== undefined) attrs[key] = value
    }
    found.push({ tag, attrs })
  }
  return found
}

const geometryKeys = ["x", "y", "width", "height", "rx", "cx", "cy", "r"] as const

function geometry(shape: Shape): string {
  const parts = geometryKeys.flatMap((key) => {
    const value = shape.attrs[key]
    return value === undefined ? [] : [`${key}=${value}`]
  })
  return [shape.tag, ...parts].join(" ")
}

function channel(value: number): number {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  return 0.2126 * channel(Math.floor(n / 65536) % 256) + 0.7152 * channel(Math.floor(n / 256) % 256) + 0.0722 * channel(n % 256)
}

function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

function fills(css: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const match of css.matchAll(/\.([a-z]+)\s*\{\s*fill:\s*(#[0-9a-fA-F]{6})\s*\}/g)) {
    const name = match[1]
    const value = match[2]
    if (name !== undefined && value !== undefined) out[name] = value
  }
  return out
}

test("logo.svg and favicon.svg are self-contained", () => {
  for (const name of ["logo.svg", "favicon.svg"]) {
    const svg = readPublic(name)
    for (const forbidden of ["<text", "<script", "<image", "href", "@import"]) {
      expect(svg.includes(forbidden), `${name} must not contain ${forbidden}`).toBe(false)
    }
  }
})

test("logo.svg paints an ink tile, a paper F and an accent dot", () => {
  const [tile, ...rest] = shapes(readPublic("logo.svg"))
  expect(tile?.attrs.fill).toBe(INK)
  const bars = rest.filter((shape) => shape.tag === "rect")
  const dots = rest.filter((shape) => shape.tag === "circle")
  expect(bars).toHaveLength(3)
  for (const bar of bars) expect(bar.attrs.fill).toBe(PAPER)
  expect(dots).toHaveLength(1)
  expect(dots[0]?.attrs.fill).toBe(ACCENT)
})

test("logo.svg geometry matches the brand-mark spec", () => {
  expect(shapes(readPublic("logo.svg")).map(geometry)).toEqual([
    "rect width=64 height=64 rx=15",
    "rect x=17 y=11 width=11 height=42 rx=5.5",
    "rect x=17 y=11 width=30 height=10 rx=5",
    "rect x=17 y=27 width=22 height=10 rx=5",
    "circle cx=40 cy=47.5 r=5.5",
  ])
})

test("favicon.svg draws the same shapes as logo.svg", () => {
  expect(shapes(readPublic("favicon.svg")).map(geometry)).toEqual(shapes(readPublic("logo.svg")).map(geometry))
})

test("the accent keeps at least 3:1 contrast against paper and ink", () => {
  expect(contrast(ACCENT, PAPER)).toBeGreaterThanOrEqual(3)
  expect(contrast(ACCENT, INK)).toBeGreaterThanOrEqual(3)
})

test("favicon.svg swaps tile and F in dark mode and leaves the dot alone", () => {
  const css = /<style>([\s\S]*?)<\/style>/.exec(readPublic("favicon.svg"))?.[1] ?? ""
  const at = css.indexOf("@media (prefers-color-scheme: dark)")
  expect(at).toBeGreaterThan(-1)
  expect(fills(css.slice(0, at))).toEqual({ bg: INK, fg: PAPER, dot: ACCENT })
  expect(fills(css.slice(at))).toEqual({ bg: PAPER, fg: INK_DARK })
})
