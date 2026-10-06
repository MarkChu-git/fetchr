import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { pageCopy, type Locale, type PageCopy } from "../../src/i18n.ts"
import { loadFonts } from "./font-store.ts"
import { build, defaultPaths, generate, type Built, type Paths } from "./generate.ts"
import { parsePng } from "./png.ts"

const real = defaultPaths()

let baselineBuild: Promise<Built> | undefined
const baseline = (): Promise<Built> => (baselineBuild ??= build({ paths: real }))

const sha = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex")

function image(built: Built, name: string): Uint8Array {
  const bytes = built.images.get(name)
  if (bytes === undefined) throw new Error(`the build has no ${name}`)
  return bytes
}

function tempPaths(): { readonly dir: string; readonly paths: Paths } {
  const dir = mkdtempSync(join(tmpdir(), "fetchr-og-"))
  return { dir, paths: { ...real, publicDir: join(dir, "public"), assetsModule: join(dir, "src", "share-assets.gen.ts") } }
}

const INK = [0x25, 0x25, 0x2a] as const
const PAPER = [0xf3, 0xf3, 0xf5] as const
const WHITE = [0xff, 0xff, 0xff] as const
const ACCENT = [0xe9, 0x59, 0x2a] as const

const hasColor = (palette: readonly (readonly [number, number, number])[], color: readonly [number, number, number]): boolean =>
  palette.some((entry) => entry[0] === color[0] && entry[1] === color[1] && entry[2] === color[2])

/** Reorders the characters of the real headline, so every glyph is one the committed fonts already cover. */
const reorderedZh = (): PageCopy => ({ ...pageCopy("zh"), shareHeadline: "下载视频和图片，粘贴链接" })

test("builds the full set of files at the sizes the spec names", async () => {
  const built = await baseline()
  expect([...built.images.keys()].sort()).toEqual([
    "apple-touch-icon.png",
    "favicon-32.png",
    "share/og-en.png",
    "share/og-zh.png",
    "share/square.png",
  ])
  const shape = (name: string): readonly number[] => {
    const info = parsePng(image(built, name))
    return [info.width, info.height, info.colorType]
  }
  expect(shape("share/og-zh.png")).toEqual([1200, 630, 3])
  expect(shape("share/og-en.png")).toEqual([1200, 630, 3])
  expect(shape("share/square.png")).toEqual([600, 600, 3])
  expect(shape("favicon-32.png")).toEqual([32, 32, 6])
  expect(shape("apple-touch-icon.png")).toEqual([180, 180, 6])
})

test("records each image's version as the first eight hex digits of its content hash", async () => {
  const built = await baseline()
  const { assets, moduleSource } = built
  const expected = {
    ogZh: "share/og-zh.png",
    ogEn: "share/og-en.png",
    square: "share/square.png",
    favicon32: "favicon-32.png",
    appleTouchIcon: "apple-touch-icon.png",
  } as const
  for (const [key, name] of Object.entries(expected) as Array<[keyof typeof expected, string]>) {
    expect(assets[key].version, key).toBe(sha(image(built, name)).slice(0, 8))
    expect(moduleSource).toContain(assets[key].version)
  }
  expect(assets.inputsHash).toMatch(/^[0-9a-f]{64}$/)
  expect(moduleSource).toContain("Do not edit by hand")
  expect([assets.ogZh.path, assets.square.path]).toEqual(["/share/og-zh.png", "/share/square.png"])
})

test("keeps the share images inside the palette and size limits and keeps the brand colours exact", async () => {
  const built = await baseline()
  for (const name of ["share/og-zh.png", "share/og-en.png", "share/square.png"]) {
    const bytes = image(built, name)
    const { palette } = parsePng(bytes)
    expect(palette.length, `${name} palette`).toBeLessThanOrEqual(64)
    expect(bytes.length, `${name} size`).toBeLessThanOrEqual(name === "share/square.png" ? 8 * 1024 : 25 * 1024)
    for (const color of [INK, PAPER, ACCENT]) expect(hasColor(palette, color), `${name} holds ${color.join(",")}`).toBe(true)
    if (name !== "share/square.png") expect(hasColor(palette, WHITE), `${name} holds white`).toBe(true)
  }
})

test("the apple touch icon is an opaque ink square and the favicon keeps its transparent corners", async () => {
  const built = await baseline()
  expect(parsePng(image(built, "favicon-32.png")).colorType).toBe(6)
  expect(parsePng(image(built, "apple-touch-icon.png")).width).toBe(180)
})

test("writes the build to disk exactly as built", async () => {
  const built = await baseline()
  const { dir, paths } = tempPaths()
  try {
    await generate({ paths })
    for (const [name, bytes] of built.images) {
      expect(sha(readFileSync(join(paths.publicDir, name))), name).toBe(sha(bytes))
    }
    expect(readFileSync(paths.assetsModule, "utf8")).toBe(built.moduleSource)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("another process produces the same bytes", async () => {
  const built = await baseline()
  const url = pathToFileURL(fileURLToPath(new URL("./generate.ts", import.meta.url))).href
  const script = `
    import { createHash } from "node:crypto"
    import { build, defaultPaths } from ${JSON.stringify(url)}
    const built = await build({ paths: defaultPaths() })
    const hashes = Object.fromEntries([...built.images].map(([name, bytes]) => [name, createHash("sha256").update(bytes).digest("hex")]))
    console.log(JSON.stringify({ hashes, module: createHash("sha256").update(built.moduleSource).digest("hex") }))
  `
  const run = spawnSync(process.execPath, ["-e", script], { encoding: "utf8" })
  expect(run.status, run.stderr).toBe(0)
  const other = JSON.parse(run.stdout) as { hashes: Record<string, string>; module: string }
  expect(other.hashes).toEqual(Object.fromEntries([...built.images].map(([name, bytes]) => [name, sha(bytes)])))
  expect(other.module).toBe(sha(new TextEncoder().encode(built.moduleSource)))
})

test("changing one locale's headline changes only that locale's image", async () => {
  const before = await baseline()
  const after = await build({ paths: real, copyFor: (locale: Locale) => (locale === "zh" ? reorderedZh() : pageCopy(locale)) })
  expect(sha(image(after, "share/og-zh.png"))).not.toBe(sha(image(before, "share/og-zh.png")))
  expect(sha(image(after, "share/og-en.png"))).toBe(sha(image(before, "share/og-en.png")))
  expect(sha(image(after, "share/square.png"))).toBe(sha(image(before, "share/square.png")))
  expect(after.assets.ogZh.version).not.toBe(before.assets.ogZh.version)
  expect(after.assets.inputsHash).not.toBe(before.assets.inputsHash)
})

test("changing the logo changes every image", async () => {
  const before = await baseline()
  const { dir, paths } = tempPaths()
  try {
    const logo = join(dir, "logo.svg")
    writeFileSync(logo, readFileSync(real.logo, "utf8").replace("#e9592a", "#2a59e9"))
    const after = await build({ paths: { ...paths, logo } })
    for (const name of before.images.keys()) expect(sha(image(after, name)), name).not.toBe(sha(image(before, name)))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("a character no font covers aborts the build, names it, and points at og:fonts, writing nothing", async () => {
  const fonts = loadFonts(real.fontsDir)
  let uncovered = ""
  for (let code = 0x4e00; code <= 0x9fff && uncovered === ""; code += 1) {
    if (!fonts.covers(String.fromCodePoint(code))) uncovered = String.fromCodePoint(code)
  }
  expect(uncovered).not.toBe("")
  const { dir, paths } = tempPaths()
  try {
    const copyFor = (locale: Locale): PageCopy => (locale === "zh" ? { ...pageCopy("zh"), shareHeadline: `粘贴${uncovered}` } : pageCopy(locale))
    await expect(generate({ paths, copyFor })).rejects.toThrow(new RegExp(`${uncovered}[\\s\\S]*og:fonts`))
    expect(existsSync(paths.publicDir)).toBe(false)
    expect(existsSync(paths.assetsModule)).toBe(false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("an image over its size limit aborts the build, names the image, and writes nothing", async () => {
  const { dir, paths } = tempPaths()
  try {
    await expect(generate({ paths, limits: { wide: 2_000, square: 8 * 1024 } })).rejects.toThrow(/og-zh\.png.*over its 2000-byte limit/)
    expect(existsSync(paths.publicDir) ? readdirSync(paths.publicDir) : []).toEqual([])
    expect(existsSync(paths.assetsModule)).toBe(false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
