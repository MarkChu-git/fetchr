import { defineConfig } from "@playwright/test"

// BASE_URL points at a deployed preview; unset means build and preview locally.
const external = process.env.BASE_URL

export default defineConfig({
  testDir: "tests/e2e",
  // bun test also claims *.spec.ts. E2E files use .e2e.ts so the two runners stay apart.
  testMatch: /.*\.e2e\.ts/,
  timeout: 60_000,
  retries: process.env.CI === undefined ? 0 : 1,
  use: {
    baseURL: external ?? "http://localhost:4173",
  },
  ...(external === undefined
    ? {
        webServer: {
          // The preview reads worker bindings from dist/server/.dev.vars. Append a fixture
          // secret after the build when the file does not already carry one.
          command:
            "bun run build && (grep -q FETCHR_PROXY_SECRET dist/server/.dev.vars 2>/dev/null || printf 'FETCHR_PROXY_SECRET=e2e-fixture-proxy-secret\\n' >> dist/server/.dev.vars) && bun run preview",
          cwd: "apps/web",
          url: "http://localhost:4173",
          reuseExistingServer: true,
          timeout: 180_000,
        },
      }
    : {}),
})
