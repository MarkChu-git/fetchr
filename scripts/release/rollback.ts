/**
 * Roll production back to a known-good Worker version.
 * Usage: bun run scripts/release/rollback.ts --version <id>
 * Worker rollback never touches database state; there is nothing else to undo.
 */
import { shiftTraffic } from "./cf.ts"

const version = process.argv[process.argv.indexOf("--version") + 1]
if (version === undefined || version.length === 0) {
  console.error("usage: bun run scripts/release/rollback.ts --version <worker version id>")
  process.exit(1)
}

try {
  await shiftTraffic(version, version, 100)
  console.log(`Rolled back: ${version} @ 100%`)
} catch (error) {
  console.error(`Rollback to ${version} failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
