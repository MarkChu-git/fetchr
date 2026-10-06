import { pageCopy, type Locale } from "../../src/i18n.ts"

export const locales = ["zh", "en"] as const satisfies readonly Locale[]

/** The example link drawn inside the card's input field. It is decoration, not a real post. */
const SAMPLE_LINK ="https://v.douyin.com/iR8aXk2/"

/**
 * Every string a share card draws, per locale. The templates read the same copy, so the font coverage check
 * and the font download command see exactly what ends up on the image.
 */
export function cardTexts(locale: Locale): readonly string[] {
  const copy = pageCopy(locale)
  return [copy.shareHeadline, copy.pasteLabel, copy.submit, ...copy.platforms, "Fetchr", SAMPLE_LINK]
}
