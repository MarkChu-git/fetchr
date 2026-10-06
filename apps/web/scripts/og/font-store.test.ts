import { expect, test } from "bun:test"
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { figtreeDir, loadFonts, missingGlyphs, parseFontLock, readFontLock, verifyFontFiles, woffCoverage } from "./font-store.ts"
import { cardTexts, locales } from "./share-texts.ts"

const fontsDir = fileURLToPath(new URL("./fonts/", import.meta.url))

function copyOfFonts(): string {
  const dir = mkdtempSync(join(tmpdir(), "fetchr-fonts-copy-"))
  cpSync(fontsDir, dir, { recursive: true })
  return dir
}

const validLock = {
  package: "@fontsource/noto-sans-sc",
  version: "5.3.0",
  license: "OFL-1.1",
  files: [{ file: "noto-sans-sc-108-500-normal.woff", weight: 500, slice: 108, sha256: "a".repeat(64) }],
}

test("a well-formed lock file decodes", () => {
  expect(parseFontLock(JSON.stringify(validLock)).files).toHaveLength(1)
})

test("a lock file with the wrong shape is rejected and the message says where", () => {
  const badHash = { ...validLock, files: [{ ...validLock.files[0], sha256: "zz" }] }
  expect(() => parseFontLock(JSON.stringify(badHash))).toThrow(/sha256/)
  const noVersion = { package: validLock.package, license: validLock.license, files: [] }
  expect(() => parseFontLock(JSON.stringify(noVersion))).toThrow(/version/)
  const badWeight = { ...validLock, files: [{ ...validLock.files[0], weight: 400 }] }
  expect(() => parseFontLock(JSON.stringify(badWeight))).toThrow(/weight/)
  expect(() => parseFontLock("{ not json")).toThrow(/JSON/)
})

test("the committed lock decodes and every font file matches its sha256", () => {
  const lock = readFontLock(fontsDir)
  expect(lock.files.length).toBeGreaterThan(0)
  expect(() => verifyFontFiles(fontsDir, lock)).not.toThrow()
})

test("a changed font file is reported by name", () => {
  const dir = copyOfFonts()
  try {
    const lock = readFontLock(dir)
    const victim = lock.files[0]?.file ?? ""
    writeFileSync(join(dir, victim), Buffer.concat([readFileSync(join(dir, victim)), Buffer.from([0])]))
    expect(() => verifyFontFiles(dir, lock)).toThrow(new RegExp(victim))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("a missing font file is reported by name", () => {
  const dir = copyOfFonts()
  try {
    const lock = readFontLock(dir)
    const victim = lock.files[0]?.file ?? ""
    rmSync(join(dir, victim))
    expect(() => verifyFontFiles(dir, lock)).toThrow(new RegExp(`${victim}.*missing|missing.*${victim}`))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("the licence text ships with the fonts", () => {
  expect(readFileSync(join(fontsDir, "OFL.txt"), "utf8")).toContain("SIL OPEN FONT LICENSE")
})

test("woffCoverage reads the characters a font really maps to a glyph", () => {
  const figtree = woffCoverage(readFileSync(join(figtreeDir(), "figtree-latin-500-normal.woff")))
  expect(figtree.has("F".codePointAt(0) ?? 0)).toBe(true)
  expect(figtree.has("粘".codePointAt(0) ?? 0)).toBe(false)
  const lock = readFontLock(fontsDir)
  const covered = new Set<number>()
  for (const entry of lock.files.filter((file) => file.weight === 500)) {
    for (const code of woffCoverage(readFileSync(join(fontsDir, entry.file)))) covered.add(code)
  }
  expect(covered.has("粘".codePointAt(0) ?? 0)).toBe(true)
})

test("every string drawn on a share card is covered by the loaded fonts", () => {
  const fonts = loadFonts(fontsDir)
  for (const locale of locales) {
    for (const text of cardTexts(locale)) {
      expect(missingGlyphs(text, fonts), `${locale}: ${text}`).toEqual([])
    }
  }
})

test("missingGlyphs lists each character no loaded font covers, once", () => {
  const fonts = loadFonts(fontsDir)
  let missing = ""
  for (let code = 0x4e00; code <= 0x9fff && missing === ""; code += 1) {
    const char = String.fromCodePoint(code)
    if (!fonts.covers(char)) missing = char
  }
  expect(missing).not.toBe("")
  expect(missingGlyphs(`粘贴${missing}${missing} Fetchr`, fonts)).toEqual([missing])
})

test("the font stack names Figtree first, then every Noto Sans SC slice of that weight", () => {
  const fonts = loadFonts(fontsDir)
  const lock = readFontLock(fontsDir)
  const stack = fonts.stack(700).split(", ")
  expect(stack[0]).toBe("Figtree")
  const slices = lock.files.filter((entry) => entry.weight === 700)
  expect(stack).toHaveLength(1 + slices.length)
  for (const entry of slices) expect(stack).toContain(`NSC700_${entry.slice}`)
  for (const font of fonts.fonts) expect(Buffer.isBuffer(font.data)).toBe(true)
})
