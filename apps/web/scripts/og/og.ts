/**
 * `bun run og`: regenerate the share images, the icon PNGs and src/share-assets.gen.ts from the page copy,
 * public/logo.svg and the committed fonts. Nothing is written unless every image builds.
 *
 *   --check           compare the inputs and the committed PNGs with what share-assets.gen.ts recorded. No rendering.
 *   --verify-render   render everything again and compare it byte for byte with the committed files. Writes nothing.
 */
import { check, defaultPaths, generate, verifyRender } from "./generate.ts"

const FIX = "og: run `bun run generate` and commit the result"

async function main(flags: readonly string[]): Promise<number> {
  const paths = defaultPaths()
  const [flag] = flags
  if (flags.length > 1 || (flag !== undefined && flag !== "--check" && flag !== "--verify-render")) {
    console.error("usage: bun run og [--check | --verify-render]")
    return 2
  }
  if (flag === "--check" || flag === "--verify-render") {
    const problems = flag === "--check" ? check({ paths }) : await verifyRender({ paths })
    if (problems.length === 0) {
      console.log("og: the share images and icons are up to date")
      return 0
    }
    for (const problem of problems) console.error(`og: ${problem}`)
    console.error(FIX)
    return 1
  }
  const built = await generate({ paths })
  console.log(`og: wrote ${built.images.size} images and share-assets.gen.ts`)
  return 0
}

try {
  process.exitCode = await main(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
