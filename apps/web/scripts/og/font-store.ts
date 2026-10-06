/**
 * The fonts the share cards are drawn with: Figtree from the installed @fontsource/figtree, and Noto Sans SC
 * slices committed under ./fonts with a lock file. Build-time only.
 */
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { inflateSync } from "node:zlib"
import { Schema } from "effect"

export const FONT_WEIGHTS = [500, 700] as const
export type FontWeight = (typeof FONT_WEIGHTS)[number]

/** Where the Chinese slices come from. Pinned: the lock records the hash of every file taken from here. */
export const FONT_SOURCE = { package: "@fontsource/noto-sans-sc", version: "5.3.0", license: "OFL-1.1" } as const

const LockFile = Schema.Struct({
  file: Schema.String.check(Schema.isPattern(/^noto-sans-sc-\d+-(?:500|700)-normal\.woff$/)),
  weight: Schema.Literals(FONT_WEIGHTS),
  slice: Schema.Number.check(Schema.isInt()),
  sha256: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
})

const LockSchema = Schema.Struct({
  package: Schema.Literal(FONT_SOURCE.package),
  version: Schema.String.check(Schema.isPattern(/^\d+\.\d+\.\d+$/)),
  license: Schema.Literal(FONT_SOURCE.license),
  files: Schema.Array(LockFile),
})

export type FontLock = typeof LockSchema.Type

const decodeLock = Schema.decodeUnknownSync(LockSchema)

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export function sha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex")
}

export function parseFontLock(json: string): FontLock {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch (error) {
    throw new Error(`fonts.lock.json is not valid JSON: ${messageOf(error)}`, { cause: error })
  }
  try {
    return decodeLock(value)
  } catch (error) {
    throw new Error(`fonts.lock.json does not have the expected shape: ${messageOf(error)}`, { cause: error })
  }
}

export function readFontLock(dir: string): FontLock {
  return parseFontLock(readFileSync(join(dir, "fonts.lock.json"), "utf8"))
}

/** Every file in the lock must exist and hash to the recorded value. Names each file that does not. */
export function verifyFontFiles(dir: string, lock: FontLock): void {
  const problems: string[] = []
  for (const entry of lock.files) {
    let bytes: Buffer
    try {
      bytes = readFileSync(join(dir, entry.file))
    } catch {
      problems.push(`${entry.file} is missing`)
      continue
    }
    if (sha256(bytes) !== entry.sha256) problems.push(`${entry.file} does not match its sha256 in fonts.lock.json`)
  }
  if (problems.length > 0) throw new Error(`font files do not match the lock: ${problems.join("; ")}`)
}

// ---------------------------------------------------------------- reading glyph coverage from a WOFF

const WOFF_SIGNATURE = 0x774f4646

function readTables(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 44 || view.getUint32(0) !== WOFF_SIGNATURE) throw new Error("not a WOFF font")
  const tables = new Map<string, Uint8Array>()
  const count = view.getUint16(12)
  for (let i = 0; i < count; i += 1) {
    const entry = 44 + i * 20
    const tag = String.fromCharCode(...bytes.subarray(entry, entry + 4))
    const offset = view.getUint32(entry + 4)
    const compressed = view.getUint32(entry + 8)
    const original = view.getUint32(entry + 12)
    const raw = bytes.subarray(offset, offset + compressed)
    tables.set(tag, compressed < original ? inflateSync(raw) : raw)
  }
  return tables
}

function readFormat4(view: DataView, base: number, out: Set<number>): void {
  const segments = view.getUint16(base + 6) / 2
  const endCodes = base + 14
  const startCodes = endCodes + segments * 2 + 2
  const deltas = startCodes + segments * 2
  const rangeOffsets = deltas + segments * 2
  for (let s = 0; s < segments; s += 1) {
    const end = view.getUint16(endCodes + s * 2)
    const start = view.getUint16(startCodes + s * 2)
    const delta = view.getUint16(deltas + s * 2)
    const rangeOffset = view.getUint16(rangeOffsets + s * 2)
    for (let code = start; code <= end && code < 0xffff; code += 1) {
      let glyph = 0
      if (rangeOffset === 0) {
        glyph = (code + delta) & 0xffff
      } else {
        const address = rangeOffsets + s * 2 + rangeOffset + (code - start) * 2
        const stored = address + 2 <= view.byteLength ? view.getUint16(address) : 0
        glyph = stored === 0 ? 0 : (stored + delta) & 0xffff
      }
      if (glyph !== 0) out.add(code)
    }
  }
}

function readFormat12(view: DataView, base: number, out: Set<number>): void {
  const groups = view.getUint32(base + 12)
  for (let g = 0; g < groups; g += 1) {
    const at = base + 16 + g * 12
    const start = view.getUint32(at)
    const end = view.getUint32(at + 4)
    const firstGlyph = view.getUint32(at + 8)
    if (end < start || end > 0x10ffff) continue
    for (let code = start; code <= end; code += 1) {
      if (firstGlyph + (code - start) !== 0) out.add(code)
    }
  }
}

/** The code points a WOFF (version 1) font maps to a real glyph, read from its cmap table. */
export function woffCoverage(bytes: Uint8Array): Set<number> {
  const cmap = readTables(bytes).get("cmap")
  if (cmap === undefined) throw new Error("the font has no cmap table")
  const view = new DataView(cmap.buffer, cmap.byteOffset, cmap.byteLength)
  const covered = new Set<number>()
  const records = view.getUint16(2)
  for (let i = 0; i < records; i += 1) {
    const offset = view.getUint32(4 + i * 8 + 4)
    const format = view.getUint16(offset)
    if (format === 4) readFormat4(view, offset, covered)
    else if (format === 12) readFormat12(view, offset, covered)
  }
  return covered
}

// ---------------------------------------------------------------- the font set the templates draw with

interface LoadedFont {
  readonly name: string
  readonly data: Buffer
  readonly weight: 500 | 600 | 700
  readonly style: "normal"
  readonly coverage: ReadonlySet<number>
}

export interface FontSet {
  readonly fonts: readonly LoadedFont[]
  /** The `fontFamily` value for text of this weight: Figtree first, then each Chinese slice as a per-character fallback. */
  readonly stack: (weight: FontWeight) => string
  readonly covers: (char: string) => boolean
}

/** The directory holding the installed Figtree `.woff` files. */
export function figtreeDir(): string {
  const require = createRequire(import.meta.url)
  return join(dirname(require.resolve("@fontsource/figtree/400.css")), "files")
}

export function loadFonts(dir: string): FontSet {
  const lock = readFontLock(dir)
  verifyFontFiles(dir, lock)
  const fonts: LoadedFont[] = []
  for (const weight of [500, 600, 700] as const) {
    const data = readFileSync(join(figtreeDir(), `figtree-latin-${weight}-normal.woff`))
    fonts.push({ name: "Figtree", data, weight, style: "normal", coverage: woffCoverage(data) })
  }
  for (const entry of lock.files) {
    const data = readFileSync(join(dir, entry.file))
    fonts.push({ name: `NSC${entry.weight}_${entry.slice}`, data, weight: entry.weight, style: "normal", coverage: woffCoverage(data) })
  }
  return {
    fonts,
    stack: (weight) => ["Figtree", ...fonts.filter((font) => font.name.startsWith(`NSC${weight}_`)).map((font) => font.name)].join(", "),
    covers: (char) => fonts.some((font) => font.coverage.has(char.codePointAt(0) ?? -1)),
  }
}

/** Each character of `text` that no loaded font covers, once. */
export function missingGlyphs(text: string, fonts: FontSet): string[] {
  return [...new Set(text)].filter((char) => !fonts.covers(char))
}
