/**
 * `bun run og:fonts`: fetch the Noto Sans SC slices the current share copy needs and update fonts.lock.json.
 * Run it after adding a character the committed slices do not cover.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { pageCopy } from "../../src/i18n.ts"
import { figtreeDir, woffCoverage } from "./font-store.ts"
import { syncFonts } from "./font-sync.ts"
import { cardTexts, locales } from "./share-texts.ts"

const dir = fileURLToPath(new URL("./fonts/", import.meta.url))

const covered = new Set<number>()
for (const weight of [500, 600, 700] as const) {
  for (const code of woffCoverage(readFileSync(join(figtreeDir(), `figtree-latin-${weight}-normal.woff`)))) covered.add(code)
}

try {
  const result = await syncFonts({ dir, texts: locales.flatMap((locale) => cardTexts(pageCopy(locale))), covered, fetch: (url) => fetch(url) })
  console.log(`fonts: ${result.files.length} slices in ${dir}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
