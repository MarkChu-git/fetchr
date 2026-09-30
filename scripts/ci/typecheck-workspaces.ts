/**
 * The root tsconfig has an empty file list and only references core.
 * `tsc -p tsconfig.json` therefore does not check the other packages.
 */
import { spawnSync } from "node:child_process"
import { join } from "node:path"
import { typecheckProjectPaths } from "./boundaries.ts"

const root = join(import.meta.dir, "../..")
const tsc = join(root, "node_modules/typescript/bin/tsc")
let failed = false

for (const project of typecheckProjectPaths(root)) {
  console.log(`typecheck ${project}`)
  const result = spawnSync("bun", [tsc, "-p", project, "--noEmit", "--pretty", "false"], {
    cwd: root,
    stdio: "inherit",
  })
  if (result.status !== 0) failed = true
}

if (failed) process.exit(1)
