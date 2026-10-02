/**
 * Shipped Worker and browser source stays on Web APIs.
 * Tests, fixtures, and scripts/ci may use Bun and Node, because they never deploy.
 * Core, delivery, the mux package, and the fixture package do not import a platform.
 * One platform package does not import another. Astryx and StyleX stay in the web app.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, relative, sep } from "node:path"

export type Violation = {
  readonly path: string
  readonly message: string
}

const skippedDirectories = new Set([
  "node_modules",
  "dist",
  "coverage",
  "graphify-out",
  ".git",
  ".gitnexus",
  ".wrangler",
  ".cloudflare",
])

const forbiddenDependencies = new Set([
  "zod",
  "next",
  "express",
  "fastify",
  "cheerio",
  "jsdom",
  "puppeteer",
  "playwright",
  "tailwindcss",
  "ffmpeg.wasm",
])

const forbiddenPrefixes = ["@tailwindcss/", "@nestjs/", "@ffmpeg/", "playwright", "puppeteer"]

const webOnlyPrefixes = ["@astryxdesign/", "@stylexjs/"]

const isolatedPackages = new Set([
  "@fetchr/core",
  "@fetchr/delivery",
  "@fetchr/media-browser",
  "@fetchr/fixture",
])

const runtimeApis = ["file", "spawn", "spawnSync", "serve", "write", "listen"] as const

export const forbiddenLockfiles = [
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "npm-shrinkwrap.json",
] as const

const dependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const

export function isShippedSource(relativePath: string): boolean {
  const path = normalize(relativePath)
  if (!path.endsWith(".ts") && !path.endsWith(".tsx")) return false
  if (path.endsWith(".test.ts") || path.endsWith(".test.tsx")) return false
  if (path.endsWith(".gen.ts") || path.endsWith(".gen.tsx")) return false
  if (path.includes("/fixtures/")) return false
  if (path.startsWith("apps/web/src/")) return true
  if (path.startsWith("packages/core/src/")) return true
  if (path.startsWith("packages/delivery/src/")) return true
  if (path.startsWith("packages/media-browser/src/")) return true
  return /^packages\/platform\/[^/]+\/src\//.test(path)
}

export function isWorkspacePackageDir(relativeDir: string): boolean {
  return /^(?:apps|packages)\/[^/]+$/.test(relativeDir) || /^packages\/platform\/[^/]+$/.test(relativeDir)
}

export function isForbiddenDependency(name: string): boolean {
  if (forbiddenDependencies.has(name)) return true
  return forbiddenPrefixes.some((prefix) => name.startsWith(prefix))
}

export function runtimeViolations(relativePath: string, source: string): Violation[] {
  if (!isShippedSource(relativePath)) return []
  const violations: Violation[] = []
  const withoutComments = stripComments(source)
  for (const specifier of importSpecifiers(withoutComments)) {
    if (!isRuntimeSpecifier(specifier)) continue
    violations.push({
      path: normalize(relativePath),
      message: `shipped source imports ${specifier}`,
    })
  }
  const withoutStrings = stripStrings(withoutComments)
  for (const api of runtimeApis) {
    if (!new RegExp(`\\bBun\\.${api}\\b`).test(withoutStrings)) continue
    violations.push({
      path: normalize(relativePath),
      message: `shipped source calls Bun.${api}`,
    })
  }
  return violations
}

export function boundaryViolations(input: {
  readonly packageName: string
  readonly relativePath: string
  readonly specifiers: readonly string[]
}): Violation[] {
  const violations: Violation[] = []
  for (const specifier of input.specifiers) {
    if (!specifier.startsWith("@fetchr/platform-")) continue
    const crossesPlatform =
      isolatedPackages.has(input.packageName) ||
      (input.packageName.startsWith("@fetchr/platform-") && specifier !== input.packageName)
    if (!crossesPlatform) continue
    violations.push({
      path: normalize(input.relativePath),
      message: `${input.packageName} imports ${specifier}`,
    })
  }
  return violations
}

export function dependencyViolations(input: {
  readonly name: string
  readonly path: string
  readonly dependencies: Readonly<Record<string, string>>
}): Violation[] {
  const violations: Violation[] = []
  for (const name of Object.keys(input.dependencies)) {
    if (isForbiddenDependency(name)) {
      violations.push({ path: input.path, message: `depends on ${name}` })
    }
    const webOnly = webOnlyPrefixes.some((prefix) => name.startsWith(prefix))
    if (webOnly && input.name !== "@fetchr/web") {
      violations.push({ path: input.path, message: `${name} belongs in @fetchr/web` })
    }
  }
  return violations
}

export function lockfileViolations(present: readonly string[]): Violation[] {
  return present.filter((name) => (forbiddenLockfiles as readonly string[]).includes(name)).map((name) => ({
    path: name,
    message: "this repository keeps bun.lock only",
  }))
}

export function typecheckProjectPaths(root: string): string[] {
  const projects = new Set<string>(["scripts/ci/tsconfig.json"])
  for (const file of walk(root)) {
    const rel = relativePosix(root, file)
    if (!rel.endsWith("/package.json")) continue
    const dir = rel.slice(0, -"/package.json".length)
    if (!isWorkspacePackageDir(dir)) continue
    const tsconfig = `${dir}/tsconfig.json`
    if (existsSync(join(root, tsconfig))) projects.add(tsconfig)
  }
  return [...projects].sort()
}

export function scanRepository(root: string): Violation[] {
  const violations: Violation[] = []
  const manifests = new Map<string, string>()
  const sources: { path: string; source: string }[] = []

  for (const name of forbiddenLockfiles) {
    if (existsSync(join(root, name))) {
      violations.push({ path: name, message: "this repository keeps bun.lock only" })
    }
  }

  for (const file of walk(root)) {
    const rel = relativePosix(root, file)
    if (rel === "package.json" || rel.endsWith("/package.json")) {
      const manifest = readManifest(readFileSync(file, "utf8"))
      if (manifest === undefined) {
        violations.push({ path: rel, message: "package.json is not an object" })
        continue
      }
      const dir = rel === "package.json" ? "" : rel.slice(0, -"/package.json".length)
      manifests.set(dir, manifest.name)
      violations.push(
        ...dependencyViolations({
          name: manifest.name,
          path: rel,
          dependencies: manifest.dependencies,
        }),
      )
      if (isWorkspacePackageDir(dir) && !existsSync(join(root, dir, "tsconfig.json"))) {
        violations.push({ path: dir, message: "workspace package has no tsconfig.json" })
      }
      continue
    }
    if (rel.endsWith(".ts") || rel.endsWith(".tsx")) {
      sources.push({ path: rel, source: readFileSync(file, "utf8") })
    }
  }

  for (const file of sources) {
    violations.push(...runtimeViolations(file.path, file.source))
    const packageName = packageNameFor(file.path, manifests)
    if (packageName === undefined) continue
    violations.push(
      ...boundaryViolations({
        packageName,
        relativePath: file.path,
        specifiers: importSpecifiers(stripComments(file.source)),
      }),
    )
  }

  return violations
}

function packageNameFor(relativePath: string, manifests: ReadonlyMap<string, string>): string | undefined {
  let dir = relativePath.slice(0, relativePath.lastIndexOf("/"))
  while (dir !== "") {
    const name = manifests.get(dir)
    if (name !== undefined) return name
    const slash = dir.lastIndexOf("/")
    if (slash < 0) break
    dir = dir.slice(0, slash)
  }
  return manifests.get("")
}

function readManifest(text: string): { name: string; dependencies: Record<string, string> } | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    return undefined
  }
  if (!isRecord(parsed)) return undefined
  const name = parsed.name
  if (typeof name !== "string") return undefined
  const dependencies: Record<string, string> = {}
  for (const field of dependencyFields) {
    const value = parsed[field]
    if (!isRecord(value)) continue
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === "string") dependencies[key] = item
    }
  }
  return { name, dependencies }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isRuntimeSpecifier(specifier: string): boolean {
  if (specifier === "bun" || specifier.startsWith("bun:") || specifier.startsWith("node:")) return true
  return (
    specifier === "fs" ||
    specifier === "path" ||
    specifier === "os" ||
    specifier === "child_process" ||
    specifier === "fs/promises"
  )
}

function importSpecifiers(source: string): string[] {
  const found: string[] = []
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]
      if (specifier !== undefined) found.push(specifier)
    }
  }
  return found
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1")
}

function stripStrings(source: string): string {
  return source
    .replace(/`(?:\\.|[^`\\])*`/gs, '""')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
}

function walk(root: string): string[] {
  const files: string[] = []
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (skippedDirectories.has(entry.name)) continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) files.push(path)
    }
  }
  visit(root)
  return files
}

function relativePosix(root: string, path: string): string {
  return relative(root, path).split(sep).join("/")
}

function normalize(path: string): string {
  return path.split(sep).join("/")
}
