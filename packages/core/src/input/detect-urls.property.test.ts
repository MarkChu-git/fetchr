import { expect, test } from "bun:test"
import * as fc from "fast-check"
import { detectUrls } from "./detect-urls"

test("detectUrls never throws and only returns http(s) URLs", () => {
  fc.assert(
    fc.property(fc.string(), (input) => {
      for (const found of detectUrls(input)) {
        expect(found.url.protocol === "https:" || found.url.protocol === "http:").toBe(true)
        expect(found.url.hostname.length).toBeGreaterThan(0)
      }
    }),
  )
})

test("every detected raw string appears in the input", () => {
  fc.assert(
    fc.property(
      fc.string(),
      fc.webUrl(),
      fc.string(),
      (before, url, after) => {
        const input = `${before} ${url} ${after}`
        for (const found of detectUrls(input)) {
          expect(input).toContain(found.raw)
        }
      },
    ),
  )
})

test("a well-formed http(s) URL in arbitrary text is always found", () => {
  fc.assert(
    fc.property(
      fc.string({ unit: fc.constantFrom(" ", "\n", "\t", "，", "。", "、", "！", "?"), maxLength: 10 }),
      fc.domain(),
      fc.string({ unit: fc.constantFrom(" ", "\n", "\t", "，", "。"), maxLength: 10 }),
      (before, host, after) => {
        const url = `https://${host}/x`
        const found = detectUrls(`${before}${url}${after}`)
        expect(found.some((item) => item.url.hostname === host)).toBe(true)
      },
    ),
  )
})
