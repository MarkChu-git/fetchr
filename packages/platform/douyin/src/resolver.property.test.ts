import { expect, test } from "bun:test"
import * as fc from "fast-check"
import { douyinExtractor } from "./index"

test("match never throws on arbitrary URL-ish input", () => {
  fc.assert(
    fc.property(fc.webUrl(), (raw) => {
      expect(() => douyinExtractor.match(new URL(raw))).not.toThrow()
    }),
  )
})

test("every base64url short code matches", () => {
  fc.assert(
    fc.property(
      fc.string({
        unit: fc.constantFrom(
          ..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".split(""),
        ),
        minLength: 5,
        maxLength: 16,
      }),
      (code) => {
        expect(douyinExtractor.match(new URL(`https://v.douyin.com/${code}/`))).toBe(true)
      },
    ),
  )
})

test("codes outside the base64url alphabet never match", () => {
  fc.assert(
    fc.property(
      fc.string({
        unit: fc.constantFrom("。", "，", "!", "?", "#", "%", " ", "~", "😀"),
        minLength: 1,
        maxLength: 8,
      }),
      (code) => {
        expect(douyinExtractor.match(new URL(`https://v.douyin.com/${code}/`))).toBe(false)
      },
    ),
  )
})
