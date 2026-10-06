/**
 * Fetches the Noto Sans SC slices the share copy needs from the pinned @fontsource release and records them
 * in fonts.lock.json. Everything is downloaded and checked before anything is written, so a failure leaves
 * the fonts directory as it was.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { FONT_SOURCE, FONT_WEIGHTS, sha256, type FontLock, type FontWeight } from "./font-store.ts"

const SOURCE_BASE =`https://cdn.jsdelivr.net/npm/${FONT_SOURCE.package}@${FONT_SOURCE.version}`

export interface SliceEntry {
  readonly file: string
  readonly slice: number
  readonly ranges: ReadonlyArray<readonly [number, number]>
}

function parseRanges(value: string, where: string): Array<readonly [number, number]> {
  return value.split(",").map((token) => {
    const match = /^U\+([0-9a-fA-F]+)(?:-([0-9a-fA-F]+))?$/.exec(token.trim())
    if (match === null) throw new Error(`${where}: unsupported unicode-range token "${token.trim()}"`)
    const start = Number.parseInt(match[1] ?? "", 16)
    return [start, match[2] === undefined ? start : Number.parseInt(match[2], 16)] as const
  })
}

/**
 * Besides the numbered CJK slices, the stylesheet carries four named subsets. They are skipped on purpose:
 * Latin text is Figtree's job, and a character that only a named subset covers should fail loudly rather
 * than quietly pull in a Cyrillic or Vietnamese file.
 */
const NAMED_SUBSETS: ReadonlySet<string> = new Set(["cyrillic", "vietnamese", "latin-ext", "latin"])

/** Reads fontsource's stylesheet into "which file covers which code points". Fails on anything unexpected. */
export function parseSliceMap(css: string, weight: FontWeight): SliceEntry[] {
  const blocks = css.split("@font-face").slice(1)
  if (blocks.length === 0) throw new Error(`the weight ${weight} stylesheet has no @font-face rules; the format may have changed`)
  const entries: SliceEntry[] = []
  blocks.forEach((block, i) => {
    const where = `@font-face rule ${i + 1} of the weight ${weight} stylesheet`
    const file = /url\(\.\/files\/(noto-sans-sc-([a-z0-9-]+?)-(\d+)-normal\.woff)\)\s*format\('woff'\)/.exec(block)
    if (file === null) throw new Error(`${where} has no WOFF source`)
    if (Number(file[3]) !== weight) throw new Error(`${where} names ${file[1]}, which is not weight ${weight}`)
    const range = /unicode-range:\s*([^;]+);/.exec(block)
    if (range === null) throw new Error(`${where} has no unicode-range`)
    const ranges = parseRanges(range[1] ?? "", where)
    const id = file[2] ?? ""
    if (/^\d+$/.test(id)) entries.push({ file: file[1] ?? "", slice: Number(id), ranges })
    else if (!NAMED_SUBSETS.has(id)) throw new Error(`${where} names an unknown subset "${id}"`)
  })
  return entries
}

/** The slices needed to cover `chars`, in order of first need. Names a character that no slice covers. */
export function planSlices(entries: readonly SliceEntry[], chars: readonly string[]): SliceEntry[] {
  const chosen: SliceEntry[] = []
  for (const char of chars) {
    const code = char.codePointAt(0) ?? 0
    const hit = entries.find((entry) => entry.ranges.some(([start, end]) => code >= start && code <= end))
    if (hit === undefined) throw new Error(`no font slice covers ${char} (U+${code.toString(16).toUpperCase()})`)
    if (!chosen.includes(hit)) chosen.push(hit)
  }
  return chosen
}

type Fetch = (url: string) => Promise<Response>

async function getResponse(fetch: Fetch, url: string): Promise<Response> {
  const response = await fetch(url)
  if (response.status !== 200) throw new Error(`GET ${url} returned ${response.status}`)
  return response
}

const isWoff = (bytes: Uint8Array): boolean => bytes[0] === 0x77 && bytes[1] === 0x4f && bytes[2] === 0x46 && bytes[3] === 0x46

export interface SyncOptions {
  readonly dir: string
  readonly texts: readonly string[]
  /** Code points another font already covers (Figtree). They need no slice. */
  readonly covered: ReadonlySet<number>
  readonly fetch: Fetch
}

export interface SyncResult {
  readonly files: readonly string[]
}

export async function syncFonts({ dir, texts, covered, fetch }: SyncOptions): Promise<SyncResult> {
  const chars = [...new Set(texts.flatMap((text) => Array.from(text)))].filter((char) => {
    const code = char.codePointAt(0) ?? 0
    return code > 0x7f && !covered.has(code)
  })

  const plans = await Promise.all(
    FONT_WEIGHTS.map(async (weight) => {
      const css = await (await getResponse(fetch, `${SOURCE_BASE}/${weight}.css`)).text()
      return { weight, entries: planSlices(parseSliceMap(css, weight), chars) }
    }),
  )
  const downloads = await Promise.all(
    plans.flatMap(({ weight, entries }) =>
      entries.map(async (entry) => {
        const bytes = new Uint8Array(await (await getResponse(fetch, `${SOURCE_BASE}/files/${entry.file}`)).arrayBuffer())
        if (!isWoff(bytes)) throw new Error(`${entry.file} is not a WOFF file`)
        return { weight, entry, bytes }
      }),
    ),
  )
  const licence = await (await getResponse(fetch, `${SOURCE_BASE}/LICENSE`)).text()

  const sorted = [...downloads].sort((a, b) => a.weight - b.weight || a.entry.slice - b.entry.slice)
  const lock: FontLock = {
    package: FONT_SOURCE.package,
    version: FONT_SOURCE.version,
    license: FONT_SOURCE.license,
    files: sorted.map(({ weight, entry, bytes }) => ({ file: entry.file, weight, slice: entry.slice, sha256: sha256(bytes) })),
  }

  // Nothing above wrote anything. From here on, only local file writes remain.
  mkdirSync(dir, { recursive: true })
  for (const { entry, bytes } of sorted) writeFileSync(join(dir, entry.file), bytes)
  writeFileSync(join(dir, "OFL.txt"), licence)
  const keep = new Set(sorted.map(({ entry }) => entry.file))
  for (const dirent of readdirSync(dir, { withFileTypes: true })) {
    if (dirent.isFile() && dirent.name.endsWith(".woff") && !keep.has(dirent.name)) rmSync(join(dir, dirent.name))
  }
  writeFileSync(join(dir, "fonts.lock.json"), `${JSON.stringify(lock, null, 2)}\n`)
  return { files: sorted.map(({ entry }) => entry.file) }
}
