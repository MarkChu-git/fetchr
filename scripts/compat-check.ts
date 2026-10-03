/**
 * Compatibility report. This repo has no OpenAPI contract and no database, so
 * oasdiff and migration verification stay skipped until a real contract or
 * schema exists. Faking either would manufacture false confidence.
 */
import { existsSync } from "node:fs"

console.log("Compatibility check\n")

if (existsSync("openapi/openapi.yaml") || existsSync("openapi/openapi.json")) {
  console.error("An OpenAPI spec exists but no api check is wired. Add oasdiff.")
  process.exit(1)
}
console.log("api: SKIP (no OpenAPI contract in openapi/)")

const hasD1 =
  existsSync("apps/web/wrangler.jsonc") &&
  (await Bun.file("apps/web/wrangler.jsonc").text()).includes("d1_databases")
if (hasD1) {
  console.error("A D1 binding exists but no migration check is wired.")
  process.exit(1)
}
console.log("migrations: SKIP (no database binding)")
