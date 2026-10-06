/**
 * The share cards as element trees for Satori. Layout and colours follow design.md appendix B.
 * Plain objects with `key: null`, so no JSX setup is needed. A leaf element omits `children`: Satori 0.35
 * rejects an empty `children` array on an element that is not a flex container.
 */
import type { ReactElement } from "react"
import type { PageCopy } from "../../src/i18n.ts"
import type { FontWeight } from "./font-store.ts"
import { SAMPLE_LINK } from "./share-texts.ts"

export const INK = "#25252a"
const PAPER = "#f3f3f5"
const WHITE = "#ffffff"
const ACCENT = "#e9592a"
/** The colours the quantizer must keep exactly. The accent only reaches a card through the logo. */
export const BRAND_COLORS = [INK, PAPER, WHITE, ACCENT] as const

const MUTED = "#5e5e63"
const BORDER = "#e2e2e8"
const FIELD_BORDER = "#d4d4da"
const CHIP = "rgba(37,37,42,0.07)"

type Style = Readonly<Record<string, string | number>>
type Child = ReactElement | string

export interface CardInput {
  readonly copy: PageCopy
  /** The `fontFamily` for text of a weight: Figtree first, then the Chinese slices. */
  readonly stack: (weight: FontWeight) => string
  /** `public/logo.svg` as a data URI. */
  readonly logo: string
}

export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
}

function el(type: string, style: Style, ...children: readonly Child[]): ReactElement {
  if (children.length === 0) return { type, props: { style }, key: null }
  return { type, props: { style, children: children.length === 1 ? children[0] : [...children] }, key: null }
}

function img(src: string, width: number, height: number, style: Style = {}): ReactElement {
  return { type: "img", props: { src, width, height, style: { width, height, ...style } }, key: null }
}

/** The wide card, 1200x630: brand row, headline, then a card that looks like the paste form. */
export function ogCard({ copy, stack, logo }: CardInput): ReactElement {
  const chip = (name: string): ReactElement =>
    el(
      "div",
      { display: "flex", alignItems: "center", padding: "8px 20px", borderRadius: 9999, background: CHIP, color: INK, fontSize: 24, fontWeight: 500, fontFamily: stack(500) },
      name,
    )
  return el(
    "div",
    { display: "flex", flexDirection: "column", justifyContent: "center", gap: 30, width: 1200, height: 630, padding: "0 80px", background: PAPER, color: INK, fontFamily: stack(500) },
    el(
      "div",
      { display: "flex", alignItems: "center", gap: 16 },
      img(logo, 48, 48),
      el("div", { display: "flex", fontSize: 32, fontWeight: 600, fontFamily: "Figtree" }, "Fetchr"),
    ),
    el("div", { display: "flex", fontSize: 68, fontWeight: 700, fontFamily: stack(700) }, copy.shareHeadline),
    el(
      "div",
      { display: "flex", flexDirection: "column", gap: 22, padding: 32, background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 28 },
      el("div", { display: "flex", fontSize: 24, fontWeight: 500, color: MUTED, fontFamily: stack(500) }, copy.pasteLabel),
      el(
        "div",
        { display: "flex", gap: 16 },
        el(
          "div",
          { display: "flex", flex: 1, alignItems: "center", height: 84, padding: "0 28px", border: `2px solid ${FIELD_BORDER}`, borderRadius: 16, fontSize: 28, fontWeight: 500, color: MUTED, fontFamily: "Figtree" },
          SAMPLE_LINK,
        ),
        el(
          "div",
          { display: "flex", alignItems: "center", justifyContent: "center", width: 176, height: 84, background: INK, color: PAPER, borderRadius: 16, fontSize: 32, fontWeight: 700, fontFamily: stack(700) },
          copy.submit,
        ),
      ),
      el("div", { display: "flex", gap: 12 }, ...copy.platforms.map(chip)),
    ),
  )
}

const SQUARE = 600
/** The logo tile is drawn this big. Its F spans units 11..53 of the 64-unit grid, so the F is about 280 tall. */
const LOGO_SIZE = 427
const UNIT = LOGO_SIZE / 64
/**
 * Where the F's top edge sits on the canvas, with the wordmark 40 below the F. The wordmark's line box is
 * taller than its glyphs, so 96 (not the 85 a line-box estimate gives) is what leaves equal ink margins above
 * the F and below the wordmark.
 */
const GLYPH_TOP = 96

/**
 * The square card, 600x600. The logo is drawn on the same ink as the canvas, so its rounded tile
 * disappears and only the F and the dot show.
 */
export function squareCard({ logo }: Pick<CardInput, "logo">): ReactElement {
  return el(
    "div",
    { display: "flex", position: "relative", width: SQUARE, height: SQUARE, background: INK },
    img(logo, LOGO_SIZE, LOGO_SIZE, { position: "absolute", left: (SQUARE - LOGO_SIZE) / 2, top: GLYPH_TOP - 11 * UNIT }),
    el(
      "div",
      { display: "flex", position: "absolute", left: 0, top: GLYPH_TOP + 42 * UNIT + 40, width: SQUARE, justifyContent: "center", fontSize: 92, fontWeight: 600, color: PAPER, fontFamily: "Figtree" },
      "Fetchr",
    ),
  )
}
