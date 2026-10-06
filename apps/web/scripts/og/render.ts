/** Satori draws an element tree to SVG; resvg turns SVG into pixels. Build-time only. */
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { initWasm, Resvg } from "@resvg/resvg-wasm"
import satori from "satori"
import type { ReactElement } from "react"
import type { FontSet } from "./font-store.ts"
import type { Rgba } from "./png.ts"

let wasm: Promise<void> | undefined

function ready(): Promise<void> {
  wasm ??= initWasm(readFileSync(createRequire(import.meta.url).resolve("@resvg/resvg-wasm/index_bg.wasm")))
  return wasm
}

/** Text becomes outlines in the SVG, so resvg never needs a font. */
export function drawSvg(element: ReactElement, width: number, height: number, fonts: FontSet): Promise<string> {
  return satori(element, {
    width,
    height,
    fonts: fonts.fonts.map(({ name, data, weight, style }) => ({ name, data, weight, style })),
  })
}

function open(svg: string, width: number | undefined): InstanceType<typeof Resvg> {
  const font = { loadSystemFonts: false }
  return new Resvg(svg, width === undefined ? { font } : { fitTo: { mode: "width", value: width }, font })
}

/** The SVG's pixels as RGBA. With `width`, the image is scaled to that width. */
export async function rasterizeRgba(svg: string, width?: number): Promise<Rgba> {
  await ready()
  const resvg = open(svg, width)
  const image = resvg.render()
  const result: Rgba = { width: image.width, height: image.height, pixels: image.pixels }
  image.free()
  resvg.free()
  return result
}
