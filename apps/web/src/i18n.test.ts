import { expect, test } from "bun:test"
import { htmlLang, localeFromCookie, localeFromSearch } from "./i18n"

test("locale search and cookie accept only Chinese and English", () => {
  expect(localeFromSearch("en")).toBe("en")
  expect(localeFromSearch("zh")).toBe("zh")
  expect(localeFromSearch("fr")).toBe("zh")
  expect(localeFromSearch(null)).toBe("zh")
  expect(localeFromCookie(null)).toBe("zh")
  expect(localeFromCookie("fetchr_locale=en")).toBe("en")
  expect(localeFromCookie("other=1; fetchr_locale=zh")).toBe("zh")
  expect(localeFromCookie("fetchr_locale=english")).toBe("zh")
  expect(htmlLang("en")).toBe("en")
  expect(htmlLang("zh")).toBe("zh-CN")
})
