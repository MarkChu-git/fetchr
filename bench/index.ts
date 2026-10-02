import { readdir } from "node:fs/promises"
import { join } from "node:path"

export interface Bench {
  readonly name: string
  /** true = regression gate blocks; false = informational only. */
  readonly blocking: boolean
  readonly run: () => void | Promise<void>
}

interface BaselineEntry {
  readonly nsPerOp: number
  readonly blocking: boolean
}

type Baseline = Record<string, BaselineEntry>

const baselinePath = join(import.meta.dir, "baseline.json")

async function timeIt(run: Bench["run"]): Promise<number> {
  // Warmup, then five measured rounds of 2000 iterations; take the best round.
  // Timing loops are sequential by definition.
  // oxlint-disable-next-line no-await-in-loop
  for (let i = 0; i < 100; i += 1) await run()
  let best = Number.POSITIVE_INFINITY
  for (let round = 0; round < 5; round += 1) {
    const start = Bun.nanoseconds()
    // oxlint-disable-next-line no-await-in-loop
    for (let i = 0; i < 2000; i += 1) await run()
    best = Math.min(best, (Bun.nanoseconds() - start) / 2000)
  }
  return best
}

function toBaselineEntry(value: unknown): BaselineEntry | undefined {
  if (typeof value !== "object" || value === null) return undefined
  if (!("nsPerOp" in value) || !("blocking" in value)) return undefined
  if (typeof value.nsPerOp !== "number" || typeof value.blocking !== "boolean") return undefined
  return { nsPerOp: value.nsPerOp, blocking: value.blocking }
}

async function main() {
  const write = process.argv.includes("--write")
  let baseline: Baseline = {}
  if (!write && (await Bun.file(baselinePath).exists())) {
    const raw: unknown = JSON.parse(await Bun.file(baselinePath).text())
    if (typeof raw === "object" && raw !== null) {
      for (const [name, value] of Object.entries(raw)) {
        const entry = toBaselineEntry(value)
        if (entry !== undefined) baseline[name] = entry
      }
    }
  }

  const files = (await readdir(import.meta.dir)).filter((f) => f.endsWith(".bench.ts"))
  const benches: Bench[] = []
  for (const file of files) {
    // Load and run benches one at a time so one bench cannot warm another's caches.
    // oxlint-disable-next-line no-await-in-loop
    const mod: unknown = await import(join(import.meta.dir, file))
    if (typeof mod === "object" && mod !== null && "benches" in mod && Array.isArray(mod.benches)) {
      benches.push(...(mod.benches as readonly Bench[]))
    }
  }
  if (benches.length === 0) throw new Error("no benches found")

  const results: Record<string, BaselineEntry> = {}
  let failed = false
  const rows: string[] = []
  for (const bench of benches) {
    // oxlint-disable-next-line no-await-in-loop
    const nsPerOp = await timeIt(bench.run)
    results[bench.name] = { nsPerOp: Math.round(nsPerOp), blocking: bench.blocking }
    const base = baseline[bench.name]
    if (write || base === undefined) {
      rows.push(`${bench.name}: ${(nsPerOp / 1000).toFixed(1)}µs/op (new)`)
      continue
    }
    const delta = (nsPerOp - base.nsPerOp) / base.nsPerOp
    const pct = `${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)}%`
    let verdict = "PASS"
    if (delta > 0.1 && bench.blocking) {
      verdict = "FAIL"
      failed = true
    } else if (delta > 0.05) {
      verdict = "WARN"
      console.warn(`::warning::${bench.name} regressed ${pct} (informational)`)
    }
    rows.push(`${bench.name}: ${(nsPerOp / 1000).toFixed(1)}µs/op vs ${(base.nsPerOp / 1000).toFixed(1)}µs/op ${pct} ${verdict}${bench.blocking ? "" : " (informational)"}`)
  }

  console.log("Benchmarks\n")
  for (const row of rows) console.log(row)
  if (write) {
    await Bun.write(baselinePath, `${JSON.stringify(results, null, 2)}\n`)
    console.log("\nBaseline updated.")
  }
  if (failed) {
    console.error("\nRESULT: FAIL (a blocking benchmark regressed > 10%)")
    process.exitCode = 1
  }
}

await main()
