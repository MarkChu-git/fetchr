import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pageCopy, type Locale, type PageCopy } from "../../src/i18n.ts"
import { readFontLock } from "./font-store.ts"
import { check, defaultPaths, generate, verifyRender, type Paths } from "./generate.ts"

const real = defaultPaths()

interface Workspace {
  readonly dir: string
  readonly paths: Paths
}

/** A throwaway app directory holding a freshly generated set, so the committed files are never touched. */
async function freshWorkspace(): Promise<Workspace> {
  const dir = mkdtempSync(join(tmpdir(), "fetchr-check-"))
  const paths: Paths = { ...real, publicDir: join(dir, "public"), assetsModule: join(dir, "src", "share-assets.gen.ts") }
  await generate({ paths })
  return { dir, paths }
}

let pristine: Promise<Workspace> | undefined
const pristineWorkspace = (): Promise<Workspace> => (pristine ??= freshWorkspace())

/** A copy of the pristine workspace that a test is free to damage. */
async function damageable(): Promise<Workspace> {
  const source = await pristineWorkspace()
  const dir = mkdtempSync(join(tmpdir(), "fetchr-check-copy-"))
  cpSync(source.dir, dir, { recursive: true })
  return { dir, paths: { ...real, publicDir: join(dir, "public"), assetsModule: join(dir, "src", "share-assets.gen.ts") } }
}

function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (current: string, prefix: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(current, entry.name), `${prefix}${entry.name}/`)
      else out[`${prefix}${entry.name}`] = createHash("sha256").update(readFileSync(join(current, entry.name))).digest("hex")
    }
  }
  walk(dir, "")
  return out
}

const reorderedZh = (locale: Locale): PageCopy =>
  locale === "zh" ? { ...pageCopy("zh"), shareHeadline: "下载视频和图片，粘贴链接" } : pageCopy(locale)

test("a freshly generated set passes the check, and the check does not render", async () => {
  const { paths } = await pristineWorkspace()
  const problems = check({ paths })
  expect(Array.isArray(problems)).toBe(true)
  expect(problems).toEqual([])
})

test("changed copy without regenerating fails the check and says the inputs changed", async () => {
  const { paths } = await pristineWorkspace()
  const problems = check({ paths, copyFor: reorderedZh })
  expect(problems).toHaveLength(1)
  expect(problems[0]).toMatch(/inputs changed/)
})

test("a changed logo fails the check", async () => {
  const { dir, paths } = await damageable()
  try {
    const logo = join(dir, "logo.svg")
    writeFileSync(logo, readFileSync(real.logo, "utf8").replace("#e9592a", "#2a59e9"))
    expect(check({ paths: { ...paths, logo } }).join("\n")).toMatch(/inputs changed/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("replacing a committed PNG fails the check and names the file", async () => {
  const { dir, paths } = await damageable()
  try {
    const other = readFileSync(join(paths.publicDir, "share", "og-en.png"))
    writeFileSync(join(paths.publicDir, "share", "og-zh.png"), other)
    const problems = check({ paths })
    expect(problems.some((problem) => problem.includes("share/og-zh.png"))).toBe(true)
    expect(problems.some((problem) => problem.includes("share/og-en.png"))).toBe(false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("a missing PNG fails the check and names the file", async () => {
  const { dir, paths } = await damageable()
  try {
    rmSync(join(paths.publicDir, "apple-touch-icon.png"))
    expect(check({ paths }).some((problem) => problem.includes("apple-touch-icon.png") && /missing/.test(problem))).toBe(true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("a missing or malformed share-assets module fails the check and names it", async () => {
  const { dir, paths } = await damageable()
  try {
    writeFileSync(paths.assetsModule, "export const shareAssets = { nope: true } as const\n")
    expect(check({ paths }).join("\n")).toMatch(/share-assets\.gen\.ts/)
    rmSync(paths.assetsModule)
    expect(check({ paths }).join("\n")).toMatch(/share-assets\.gen\.ts/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("a font file that no longer matches the lock fails the check and names the file", async () => {
  const { dir, paths } = await damageable()
  try {
    const fontsDir = join(dir, "fonts")
    mkdirSync(fontsDir)
    cpSync(real.fontsDir, fontsDir, { recursive: true })
    const victim = readFontLock(fontsDir).files[0]?.file ?? ""
    writeFileSync(join(fontsDir, victim), Buffer.concat([readFileSync(join(fontsDir, victim)), Buffer.from([0])]))
    const problems = check({ paths: { ...paths, fontsDir } })
    expect(problems.join("\n")).toContain(victim)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("verify-render passes on an up-to-date set and changes nothing", async () => {
  const { dir, paths } = await damageable()
  try {
    const before = snapshot(dir)
    expect(await verifyRender({ paths })).toEqual([])
    expect(snapshot(dir)).toEqual(before)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("verify-render names a committed PNG that differs from a fresh render, and still changes nothing", async () => {
  const { dir, paths } = await damageable()
  try {
    writeFileSync(join(paths.publicDir, "share", "og-zh.png"), readFileSync(join(paths.publicDir, "share", "og-en.png")))
    const before = snapshot(dir)
    const mismatches = await verifyRender({ paths })
    expect(mismatches.some((line) => line.includes("share/og-zh.png"))).toBe(true)
    expect(snapshot(dir)).toEqual(before)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
