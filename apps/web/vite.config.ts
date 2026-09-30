import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { cloudflare } from "@cloudflare/vite-plugin"
import {
  LIGHTNINGCSS_TARGETS,
  astryxStylex,
} from "@astryxdesign/build/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const appDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(appDir, "../..")

function astryxRoot(): string {
  const candidates = [appDir, repoRoot]
  for (const candidate of candidates) {
    if (
      existsSync(
        path.join(candidate, "node_modules/@astryxdesign/core/package.json"),
      )
    ) {
      return candidate
    }
  }
  return repoRoot
}

const stylexRoot = astryxRoot()

export default defineConfig({
  server: {
    fs: {
      allow: [appDir, repoRoot, stylexRoot],
    },
  },
  // esbuild prebundling leaves stylex.defineVars in place, which throws in workerd.
  ssr: {
    noExternal: [/@astryxdesign\//, /@stylexjs\//],
    optimizeDeps: {
      exclude: [
        "@astryxdesign/core",
        "@astryxdesign/theme-stone",
        "@stylexjs/stylex",
      ],
    },
  },
  optimizeDeps: {
    exclude: [
      "@astryxdesign/core",
      "@astryxdesign/theme-stone",
      "@stylexjs/stylex",
    ],
  },
  css: {
    transformer: "lightningcss",
    lightningcss: {
      targets: LIGHTNINGCSS_TARGETS,
    },
  },
  build: {
    cssMinify: "lightningcss",
    // Older targets rewrite light-dark() into variables and break Stone.
    cssTarget: ["chrome123", "firefox120", "safari17.5"],
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart(),
    ...astryxStylex({
      rootDir: stylexRoot,
      libraryPattern: "@astryxdesign/",
      lightningcssTargets: LIGHTNINGCSS_TARGETS,
    }),
    react(),
  ],
})
