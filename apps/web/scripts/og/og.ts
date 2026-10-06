/**
 * `bun run og`: regenerate the share images, the icon PNGs and src/share-assets.gen.ts from the page copy,
 * public/logo.svg and the committed fonts. Nothing is written unless every image builds.
 */
import { defaultPaths, generate } from "./generate.ts"

try {
  const built = await generate({ paths: defaultPaths() })
  console.log(`og: wrote ${built.images.size} images and share-assets.gen.ts`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
