import { describe, expect, test } from "bun:test"
import { aBogus, msToken } from "./abogus"
import { md5Hex } from "./md5"

describe("md5", () => {
  test("matches published digests", () => {
    expect(md5Hex("")).toBe("d41d8cd98f00b204e9800998ecf8427e")
    expect(md5Hex("abc")).toBe("900150983cd24fb0d6963f7d28e17f72")
    expect(md5Hex("The quick brown fox jumps over the lazy dog")).toBe(
      "9e107d9d372bb6826bd81d3542a419d6",
    )
    expect(md5Hex("中文测试")).toBe("089b4943ea034acfa445d050c7913e55")
    // Cross the 64-byte block boundary to exercise padding.
    expect(
      md5Hex("abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijk"),
    ).toBe("1b30c0670c15e7da3c2ba7bce77ebe99")
  })
})

describe("aBogus", () => {
  const userAgent =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

  test("reproduces the reference signature for a fixed input", () => {
    // Captured from the live-verified reference implementation (2026-10-01).
    const query =
      "aid=6383&aweme_id=7000000000000000002&device_platform=webapp&msToken=FIXEDTOKEN"
    expect(aBogus(query, "", userAgent, 1700000000)).toBe(
      "DFSzswVYWX85z3iQLP6qChqQLmdXYTe-ot03x1K",
    )
  })

  test("changes with the timestamp", () => {
    const query = "aid=6383&aweme_id=1"
    expect(aBogus(query, "", userAgent, 1700000000)).not.toBe(
      aBogus(query, "", userAgent, 1700000001),
    )
  })
})

describe("msToken", () => {
  test("fills the requested length from the injected source", () => {
    const token = msToken(107, (n) => new Uint8Array(n).fill(7))
    expect(token).toHaveLength(107)
    expect(new Set(token).size).toBe(1)
  })

  test("uses only the token alphabet", () => {
    const token = msToken(256, (n) =>
      Uint8Array.from({ length: n }, (_, i) => i % 256),
    )
    expect(/^[A-Za-z0-9=_-]+$/.test(token)).toBe(true)
  })
})
