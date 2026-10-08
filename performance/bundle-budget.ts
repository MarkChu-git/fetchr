import { gzipSync } from "node:zlib"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { applyBaseline } from "./budgets-file.ts"

const metricKeys = ["totalGzipKb", "jsTotalGzipKb", "mainEntryGzipKb", "largestChunkGzipKb"] as const

type Metrics = Readonly<Record<(typeof metricKeys)[number], number>>

interface Budgets {
  readonly absolute: Metrics
  readonly relative: { readonly warnPct: number; readonly failPct: number }
  readonly baseline: Metrics
}

const budgetsPath = join(import.meta.dir, "budgets.json")
const distDir = join(import.meta.dir, "../apps/web/dist/client")

async function measure(): Promise<Metrics> {
  const paths: string[] = []
  const stack = [distDir]
  while (stack.length > 0) {
    const dir = stack.pop()
    if (dir === undefined) break
    // oxlint-disable-next-line no-await-in-loop
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) stack.push(path)
      else paths.push(path)
    }
  }
  const files = await Promise.all(
    paths.map(async (path) => ({
      name: path.split("/").pop() ?? path,
      gzipKb: gzipSync(await readFile(path)).length / 1024,
    })),
  )

  const js = files.filter((f) => f.name.endsWith(".js"))
  const mainEntry = js
    .filter((f) => f.name.startsWith("index-"))
    .sort((a, b) => b.gzipKb - a.gzipKb)[0]
  const largest = [...files].sort((a, b) => b.gzipKb - a.gzipKb)[0]
  return {
    totalGzipKb: files.reduce((sum, f) => sum + f.gzipKb, 0),
    jsTotalGzipKb: js.reduce((sum, f) => sum + f.gzipKb, 0),
    mainEntryGzipKb: mainEntry?.gzipKb ?? 0,
    largestChunkGzipKb: largest?.gzipKb ?? 0,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function toKbRecord(value: unknown): Metrics | undefined {
  if (!isRecord(value)) return undefined
  const { totalGzipKb, jsTotalGzipKb, mainEntryGzipKb, largestChunkGzipKb } = value
  if (
    typeof totalGzipKb !== "number" ||
    typeof jsTotalGzipKb !== "number" ||
    typeof mainEntryGzipKb !== "number" ||
    typeof largestChunkGzipKb !== "number"
  ) {
    return undefined
  }
  return { totalGzipKb, jsTotalGzipKb, mainEntryGzipKb, largestChunkGzipKb }
}

async function main() {
  const write = process.argv.includes("--write")
  const raw: unknown = JSON.parse(await Bun.file(budgetsPath).text())
  if (!isRecord(raw)) throw new Error("budgets.json is not an object")
  const absolute = toKbRecord(raw.absolute)
  const baseline = toKbRecord(raw.baseline)
  const relativeRaw = isRecord(raw.relative) ? raw.relative : {}
  const budgets: Budgets = {
    absolute: absolute ?? { totalGzipKb: 0, jsTotalGzipKb: 0, mainEntryGzipKb: 0, largestChunkGzipKb: 0 },
    baseline: baseline ?? { totalGzipKb: 0, jsTotalGzipKb: 0, mainEntryGzipKb: 0, largestChunkGzipKb: 0 },
    relative: {
      warnPct: typeof relativeRaw.warnPct === "number" ? relativeRaw.warnPct : 5,
      failPct: typeof relativeRaw.failPct === "number" ? relativeRaw.failPct : 10,
    },
  }
  if (absolute === undefined || baseline === undefined) {
    throw new Error("budgets.json is missing absolute or baseline metrics")
  }
  const current = await measure()

  if (write) {
    const next = applyBaseline(raw, current)
    await Bun.write(budgetsPath, `${JSON.stringify(next, null, 2)}\n`)
    console.log("baseline updated:", JSON.stringify(current))
    return
  }

  console.log("Bundle budget (apps/web/dist/client, gzip)\n")
  let failed = false
  for (const key of metricKeys) {
    const value = current[key]
    const limit = budgets.absolute[key]
    const base = budgets.baseline[key]
    const growthPct = base > 0 ? ((value - base) / base) * 100 : 0
    const parts = [`${key}: ${value.toFixed(0)}KB`]
    let verdict = "PASS"
    if (value > limit) {
      verdict = `FAIL (over the absolute limit ${limit}KB)`
      failed = true
    } else if (growthPct > budgets.relative.failPct) {
      verdict = `FAIL (+${growthPct.toFixed(1)}% vs baseline, limit +${budgets.relative.failPct}%)`
      failed = true
    } else if (growthPct > budgets.relative.warnPct) {
      verdict = `WARN (+${growthPct.toFixed(1)}% vs baseline)`
      console.warn(`::warning::bundle ${key} grew ${growthPct.toFixed(1)}%`)
    }
    parts.push(verdict)
    console.log(parts.join("  "))
  }
  if (failed) {
    console.error("\nRESULT: FAIL (see which metric exceeded which threshold above)")
    process.exitCode = 1
  } else {
    console.log("\nRESULT: PASS")
  }
}

await main()
