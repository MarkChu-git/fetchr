import { join } from "node:path"
import { expect, test } from "bun:test"
import {
  boundaryViolations,
  dependencyViolations,
  isForbiddenDependency,
  isShippedSource,
  lockfileViolations,
  runtimeViolations,
  scanRepository,
  typecheckProjectPaths,
} from "./boundaries.ts"

const root = join(import.meta.dir, "../..")

const messages = (path: string, source: string): string[] => runtimeViolations(path, source).map((item) => item.message)

test("shipped source is the code that deploys", () => {
  expect(isShippedSource("packages/core/src/extract.ts")).toBe(true)
  expect(isShippedSource("packages/platform/tiktok/src/parser.ts")).toBe(true)
  expect(isShippedSource("apps/web/src/server/product.ts")).toBe(true)
  expect(isShippedSource("packages/core/src/extract.test.ts")).toBe(false)
  expect(isShippedSource("apps/web/src/routeTree.gen.ts")).toBe(false)
  expect(isShippedSource("packages/platform/douyin/src/fixtures/video.ts")).toBe(false)
  expect(isShippedSource("apps/web/vite.config.ts")).toBe(false)
  expect(isShippedSource("scripts/ci/publish-worker.ts")).toBe(false)
})

test("shipped source cannot import Node or call Bun", () => {
  const imported = runtimeViolations(
    "packages/core/src/extract.ts",
    'import { readFileSync } from "node:fs"\n',
  )
  expect(imported.map((item) => item.message)).toEqual(["shipped source imports node:fs"])

  const called = runtimeViolations("apps/web/src/server/product.ts", "const child = Bun.spawn([])\n")
  expect(called.map((item) => item.message)).toEqual(["shipped source calls Bun.spawn"])
})

test("tests, comments, and ordinary strings are not runtime imports", () => {
  expect(runtimeViolations("packages/core/src/extract.test.ts", 'import { test } from "bun:test"\n')).toEqual([])
  expect(
    runtimeViolations("packages/core/src/extract.ts", '// Bun.file("note")\nconst label = "node:fs"\n'),
  ).toEqual([])
})

test("shipped source cannot import the share-image renderers", () => {
  const page = "apps/web/src/routes/__root.tsx"
  expect(messages(page, 'import satori from "satori"\n')).toEqual(["shipped source imports satori, which only runs at build time"])
  expect(messages(page, 'import { Resvg } from "@resvg/resvg-wasm"\n')).toEqual([
    "shipped source imports @resvg/resvg-wasm, which only runs at build time",
  ])
  expect(messages(page, 'import wasm from "@resvg/resvg-wasm/index_bg.wasm"\n')).toHaveLength(1)
  expect(messages(page, 'const { default: satori } = await import("satori")\n')).toHaveLength(1)
  expect(messages(page, 'const { Resvg } = require("@resvg/resvg-js")\n')).toHaveLength(1)
})

test("shipped source cannot reach the generator by a relative path", () => {
  expect(messages("apps/web/src/routes/index.tsx", 'import { ogCard } from "../../scripts/og/templates"\n')).toEqual([
    "shipped source imports ../../scripts/og/templates, which only runs at build time",
  ])
  expect(messages("apps/web/src/share-meta.ts", 'import lock from "../scripts/og/fonts/fonts.lock.json"\n')).toHaveLength(1)
  expect(messages("apps/web/src/share-meta.ts", 'import "../scripts"\n')).toHaveLength(1)
})

test("the generator, tests, comments, and the module the generator wrote are not caught by that rule", () => {
  expect(
    messages("apps/web/scripts/og/render.ts", 'import satori from "satori"\nimport { initWasm } from "@resvg/resvg-wasm"\n'),
  ).toEqual([])
  expect(messages("apps/web/src/share-assets.test.ts", 'import satori from "satori"\n')).toEqual([])
  expect(messages("apps/web/src/share-meta.ts", '// drawn by satori and @resvg/resvg-wasm\nconst drawnBy = "satori"\n')).toEqual([])
  // The one way the page gets the images.
  expect(messages("apps/web/src/routes/__root.tsx", 'import { shareAssets } from "../share-assets.gen"\n')).toEqual([])
  // A scripts folder inside src is not the generator's.
  expect(messages("apps/web/src/server/product.ts", 'import { run } from "./scripts/run"\n')).toEqual([])
})

test("platform packages stay apart from core and from each other", () => {
  expect(
    boundaryViolations({
      packageName: "@fetchr/core",
      relativePath: "packages/core/src/extract.ts",
      specifiers: ["@fetchr/platform-tiktok"],
    }).map((item) => item.message),
  ).toEqual(["@fetchr/core imports @fetchr/platform-tiktok"])

  expect(
    boundaryViolations({
      packageName: "@fetchr/platform-tiktok",
      relativePath: "packages/platform/tiktok/src/extractor.ts",
      specifiers: ["@fetchr/platform-douyin"],
    }),
  ).toHaveLength(1)

  expect(
    boundaryViolations({
      packageName: "@fetchr/platform-tiktok",
      relativePath: "packages/platform/tiktok/src/extractor.test.ts",
      specifiers: ["@fetchr/platform-tiktok"],
    }),
  ).toEqual([])

  expect(
    boundaryViolations({
      packageName: "@fetchr/web",
      relativePath: "apps/web/src/server/product.ts",
      specifiers: ["@fetchr/platform-youtube"],
    }),
  ).toEqual([])
})

test("forbidden libraries and web-only UI packages are rejected", () => {
  expect(isForbiddenDependency("zod")).toBe(true)
  expect(isForbiddenDependency("@nestjs/core")).toBe(true)
  expect(isForbiddenDependency("effect")).toBe(false)

  expect(
    dependencyViolations({
      name: "@fetchr/core",
      path: "packages/core/package.json",
      dependencies: { zod: "1.0.0", "@stylexjs/stylex": "0.19.1" },
    }).map((item) => item.message),
  ).toEqual(["depends on zod", "@stylexjs/stylex belongs in @fetchr/web"])

  expect(
    dependencyViolations({
      name: "@fetchr/web",
      path: "apps/web/package.json",
      dependencies: { "@astryxdesign/core": "0.6.3" },
    }),
  ).toEqual([])
})

test("npm and pnpm lockfiles are rejected", () => {
  expect(lockfileViolations(["bun.lock", "package-lock.json"]).map((item) => item.path)).toEqual([
    "package-lock.json",
  ])
})

test("this repository passes the boundary scan", () => {
  expect(scanRepository(root)).toEqual([])
})

test("typecheck lists every workspace package, the ci scripts, and the performance scripts", () => {
  const projects = typecheckProjectPaths(root)
  expect(projects).toContain("apps/web/tsconfig.json")
  expect(projects).toContain("packages/core/tsconfig.json")
  expect(projects).toContain("packages/delivery/tsconfig.json")
  expect(projects).toContain("packages/media-browser/tsconfig.json")
  expect(projects).toContain("packages/platform/tiktok/tsconfig.json")
  expect(projects).toContain("packages/platform/fixture/tsconfig.json")
  expect(projects).toContain("scripts/ci/tsconfig.json")
  expect(projects).toContain("performance/tsconfig.json")
  expect(projects.includes("tsconfig.json")).toBe(false)
})
