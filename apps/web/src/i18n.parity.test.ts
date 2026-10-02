import { expect, test } from "bun:test"
import { pageCopy, type PageCopy } from "./i18n"

test("zh and en copy carry the same keys", () => {
  const zh = pageCopy("zh")
  const en = pageCopy("en")
  const zhKeys = Object.keys(zh).sort()
  const enKeys = Object.keys(en).sort()
  expect(enKeys).toEqual(zhKeys)
})

test("no copy string is empty in either locale", () => {
  for (const locale of ["zh", "en"] as const) {
    const copy: PageCopy = pageCopy(locale)
    for (const [key, value] of Object.entries(copy)) {
      if (typeof value === "string") {
        expect(value.length, `${locale}.${key} must not be empty`).toBeGreaterThan(0)
      }
    }
  }
})
