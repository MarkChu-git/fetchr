import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseFontLock } from "./font-store.ts"
import { parseSliceMap, planSlices, syncFonts } from "./font-sync.ts"

const BASE = "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc@5.3.0"

/** A stand-in for the fontsource stylesheet: three slices, one of which the tests never need. */
function css(weight: number): string {
  return `/* noto-sans-sc-[7]-${weight}-normal */
@font-face {
  font-family: 'Noto Sans SC';
  font-style: normal;
  font-display: swap;
  font-weight: ${weight};
  src: url(./files/noto-sans-sc-7-${weight}-normal.woff2) format('woff2'), url(./files/noto-sans-sc-7-${weight}-normal.woff) format('woff');
  unicode-range: U+7c98,U+8d34-8d35;
}

/* noto-sans-sc-[8]-${weight}-normal */
@font-face {
  font-family: 'Noto Sans SC';
  font-style: normal;
  font-display: swap;
  font-weight: ${weight};
  src: url(./files/noto-sans-sc-8-${weight}-normal.woff2) format('woff2'), url(./files/noto-sans-sc-8-${weight}-normal.woff) format('woff');
  unicode-range: U+9f98;
}
`
}

function woff(label: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array([0x77, 0x4f, 0x46, 0x46, ...new TextEncoder().encode(label)])
}

type Route = () => Response

function fakeFetch(routes: Readonly<Record<string, Route>>): { fetch: (url: string) => Promise<Response>; requested: string[] } {
  const requested: string[] = []
  return {
    requested,
    fetch: (url) => {
      requested.push(url)
      const route = routes[url]
      return Promise.resolve(route === undefined ? new Response("not found", { status: 404 }) : route())
    },
  }
}

const okText = (text: string): Route => () => new Response(text, { status: 200 })
const okBytes = (bytes: Uint8Array<ArrayBuffer>): Route => () => new Response(bytes, { status: 200 })

function standardRoutes(): Record<string, Route> {
  const routes: Record<string, Route> = {
    [`${BASE}/500.css`]: okText(css(500)),
    [`${BASE}/700.css`]: okText(css(700)),
    [`${BASE}/LICENSE`]: okText("SIL OPEN FONT LICENSE Version 1.1"),
  }
  for (const weight of [500, 700]) {
    for (const slice of [7, 8]) routes[`${BASE}/files/noto-sans-sc-${slice}-${weight}-normal.woff`] = okBytes(woff(`${slice}-${weight}`))
  }
  return routes
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "fetchr-fonts-"))
}

function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of readdirSync(dir).sort()) out[name] = createHash("sha256").update(readFileSync(join(dir, name))).digest("hex")
  return out
}

const asciiOnly: ReadonlySet<number> = new Set(Array.from({ length: 128 }, (_, i) => i))

test("parseSliceMap reads each slice's file name, number and character ranges", () => {
  const entries = parseSliceMap(css(500), 500)
  expect(entries.map((entry) => [entry.file, entry.slice])).toEqual([
    ["noto-sans-sc-7-500-normal.woff", 7],
    ["noto-sans-sc-8-500-normal.woff", 8],
  ])
  expect(entries[0]?.ranges).toEqual([
    [0x7c98, 0x7c98],
    [0x8d34, 0x8d35],
  ])
})

/** One named-subset rule, like the ones fontsource appends after the numbered slices. */
function namedSubset(name: string): string {
  return `
/* noto-sans-sc-${name}-500-normal */
@font-face {
  font-family: 'Noto Sans SC';
  font-weight: 500;
  src: url(./files/noto-sans-sc-${name}-500-normal.woff2) format('woff2'), url(./files/noto-sans-sc-${name}-500-normal.woff) format('woff');
  unicode-range: U+0000-00FF;
}
`
}

test("parseSliceMap skips the named Latin, Cyrillic and Vietnamese subsets on purpose but rejects an unknown name", () => {
  const withKnown = css(500) + ["cyrillic", "vietnamese", "latin-ext", "latin"].map(namedSubset).join("")
  expect(parseSliceMap(withKnown, 500).map((entry) => entry.slice)).toEqual([7, 8])
  expect(() => parseSliceMap(css(500) + namedSubset("klingon"), 500)).toThrow(/klingon/)
})

test("parseSliceMap fails on a stylesheet it does not understand instead of returning nothing", () => {
  expect(() => parseSliceMap("body { color: red }", 500)).toThrow(/no @font-face/)
  expect(() => parseSliceMap(css(500).replace(/unicode-range:[^;]+;/, ""), 500)).toThrow(/unicode-range/)
  expect(() => parseSliceMap(css(700), 500)).toThrow(/weight 500/)
})

test("planSlices picks the slice that covers each character and names a character nothing covers", () => {
  const entries = parseSliceMap(css(500), 500)
  expect(planSlices(entries, ["粘", "贴"]).map((entry) => entry.slice)).toEqual([7])
  expect(planSlices(entries, ["粘", "龘"]).map((entry) => entry.slice)).toEqual([7, 8])
  expect(() => planSlices(entries, ["𠀀"])).toThrow(/𠀀/)
})

test("syncFonts downloads only the slices the text needs, plus the licence, and writes a matching lock", async () => {
  const dir = tempDir()
  try {
    const { fetch, requested } = fakeFetch(standardRoutes())
    const result = await syncFonts({ dir, texts: ["粘贴 Fetchr"], covered: asciiOnly, fetch })
    expect(result.files).toEqual(["noto-sans-sc-7-500-normal.woff", "noto-sans-sc-7-700-normal.woff"])
    expect(requested.some((url) => url.endsWith("noto-sans-sc-8-500-normal.woff"))).toBe(false)
    expect(readFileSync(join(dir, "OFL.txt"), "utf8")).toContain("SIL OPEN FONT LICENSE")
    const lock = parseFontLock(readFileSync(join(dir, "fonts.lock.json"), "utf8"))
    expect(lock.version).toBe("5.3.0")
    expect(lock.files.map((entry) => entry.file)).toEqual(["noto-sans-sc-7-500-normal.woff", "noto-sans-sc-7-700-normal.woff"])
    for (const entry of lock.files) {
      const bytes = readFileSync(join(dir, entry.file))
      expect(entry.sha256).toBe(createHash("sha256").update(bytes).digest("hex"))
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("syncFonts leaves the directory exactly as it was when a download fails", async () => {
  const dir = tempDir()
  try {
    writeFileSync(join(dir, "noto-sans-sc-9-500-normal.woff"), woff("old"))
    writeFileSync(join(dir, "fonts.lock.json"), "previous lock")
    writeFileSync(join(dir, "OFL.txt"), "previous licence")
    const before = snapshot(dir)
    const routes = standardRoutes()
    routes[`${BASE}/files/noto-sans-sc-7-700-normal.woff`] = () => new Response("gone", { status: 404 })
    await expect(syncFonts({ dir, texts: ["粘贴"], covered: asciiOnly, fetch: fakeFetch(routes).fetch })).rejects.toThrow(/404/)
    expect(snapshot(dir)).toEqual(before)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("syncFonts rejects a stylesheet it cannot parse and a download that is not a WOFF, changing nothing", async () => {
  const dir = tempDir()
  try {
    const before = snapshot(dir)
    const badCss = standardRoutes()
    badCss[`${BASE}/500.css`] = okText("<html>not a stylesheet</html>")
    await expect(syncFonts({ dir, texts: ["粘"], covered: asciiOnly, fetch: fakeFetch(badCss).fetch })).rejects.toThrow(/@font-face/)
    const notWoff = standardRoutes()
    notWoff[`${BASE}/files/noto-sans-sc-7-500-normal.woff`] = okBytes(new TextEncoder().encode("<html>"))
    await expect(syncFonts({ dir, texts: ["粘"], covered: asciiOnly, fetch: fakeFetch(notWoff).fetch })).rejects.toThrow(/WOFF/)
    expect(snapshot(dir)).toEqual(before)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("syncFonts names a character that no slice covers, changing nothing", async () => {
  const dir = tempDir()
  try {
    await expect(syncFonts({ dir, texts: ["𠀀"], covered: asciiOnly, fetch: fakeFetch(standardRoutes()).fetch })).rejects.toThrow(/𠀀/)
    expect(readdirSync(dir)).toEqual([])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("syncFonts drops slices the text no longer needs, only after everything else succeeded", async () => {
  const dir = tempDir()
  try {
    mkdirSync(join(dir, "nested"))
    writeFileSync(join(dir, "noto-sans-sc-8-500-normal.woff"), woff("stale"))
    await syncFonts({ dir, texts: ["粘"], covered: asciiOnly, fetch: fakeFetch(standardRoutes()).fetch })
    expect(readdirSync(dir).filter((name) => name.endsWith(".woff")).sort()).toEqual([
      "noto-sans-sc-7-500-normal.woff",
      "noto-sans-sc-7-700-normal.woff",
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("syncFonts does not fetch characters another font already covers", async () => {
  const dir = tempDir()
  try {
    const { fetch, requested } = fakeFetch(standardRoutes())
    const covered = new Set([...asciiOnly, 0x7c98])
    await syncFonts({ dir, texts: ["粘"], covered, fetch })
    expect(requested.filter((url) => url.includes("/files/"))).toEqual([])
    expect(readdirSync(dir).filter((name) => name.endsWith(".woff"))).toEqual([])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
