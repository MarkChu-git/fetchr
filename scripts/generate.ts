/**
 * Generated artifacts in this repo: apps/web/src/routeTree.gen.ts, regenerated
 * by the TanStack plugin during the Vite build. --check fails the build when
 * the committed file is stale. Never edit the generated file by hand.
 */
import { $ } from "bun"

const target = "apps/web/src/routeTree.gen.ts"

await $`bun run build`.quiet()

if (process.argv.includes("--check")) {
  const diff = await $`git diff --exit-code -- ${target}`.quiet().nothrow()
  if (diff.exitCode !== 0) {
    console.error(`${target} is stale. Run \`bun run generate\` and commit the result.`)
    process.exit(1)
  }
  console.log(`${target} is up to date.`)
} else {
  console.log(`${target} regenerated.`)
}
