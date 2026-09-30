import { join } from "node:path"
import { scanRepository } from "./boundaries.ts"

const root = join(import.meta.dir, "../..")
const violations = scanRepository(root)
for (const violation of violations) {
  console.error(`${violation.path}: ${violation.message}`)
}
if (violations.length > 0) process.exit(1)
