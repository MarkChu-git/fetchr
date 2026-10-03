/**
 * Advance a Worker version through the configured rollout stages.
 * Usage: bun run scripts/release/promote.ts --version <id> [--mode release|default]
 * Every stage: shift traffic, observe, health gate. A failed gate rolls back
 * to the version that was serving when the rollout started.
 */
import { servingVersion, shiftTraffic } from "./cf.ts"
import { defaultStages, observeSeconds, releaseStages } from "./config.ts"

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index < 0 ? undefined : process.argv[index + 1]
}

async function healthGate(): Promise<boolean> {
  const child = Bun.spawn(
    ["bun", "run", "scripts/release/health-gate.ts", "--baseline-minutes", "30", "--candidate-minutes", String(Math.max(1, Math.round(observeSeconds / 60)))],
    { stdin: "ignore", stdout: "inherit", stderr: "inherit" },
  )
  return (await child.exited) === 0
}

async function main() {
  const candidate = arg("--version")
  if (candidate === undefined) throw new Error("--version <worker version id> is required")
  const mode = arg("--mode") ?? "release"
  if (mode !== "release" && mode !== "default") {
    throw new Error(`--mode must be release or default, got "${mode}"`)
  }
  const stages = mode === "default" ? defaultStages : releaseStages
  const previous = await servingVersion()
  console.log(`Rollout: ${candidate}`)
  console.log(`Previous (rollback target): ${previous}`)
  console.log(`Stages: ${stages.join(" → ")}%`)

  for (const stage of stages) {
    console.log(`\n=== stage ${stage}% ===`)
    // Stages are sequential by definition: each shift must finish before its gate runs.
    // oxlint-disable-next-line no-await-in-loop
    await shiftTraffic(candidate, previous, stage)
    if (stage < 100 && mode === "release") {
      console.log(`observing ${observeSeconds}s`)
      // oxlint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, observeSeconds * 1000))
    }
    // oxlint-disable-next-line no-await-in-loop
    const healthy = await healthGate()
    if (!healthy) {
      console.error(`\nStage ${stage}% failed the health gate. Rolling back to ${previous}.`)
      // oxlint-disable-next-line no-await-in-loop
      await shiftTraffic(previous, candidate, 100, true)
      console.error(`Rolled back: ${previous} @ 100%`)
      process.exit(1)
    }
  }
  console.log(`\nRollout complete: ${candidate} @ 100%`)
}

await main()
