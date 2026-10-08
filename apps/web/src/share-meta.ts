/**
 * What a page tells the outside world when its link is shared: the title, the description, and the Open Graph and
 * Twitter tags. Pure, and Web APIs only (this file ships in the Worker).
 */
import type { Locale, PageCopy } from "./i18n"

interface ShareImage {
  readonly path: string
  /** The first eight hex digits of the file's content hash. It goes in `?v=`, so a new image gets a new address. */
  readonly version: string
  readonly width: number
  readonly height: number
}

/** The shape of the generated share-assets.gen.ts that this file reads. */
interface ShareImages {
  readonly ogZh: ShareImage
  readonly ogEn: ShareImage
  readonly square: ShareImage
}

export type MetaTag =
  | { readonly title: string }
  | { readonly name: string; readonly content: string }
  | { readonly property: string; readonly content: string }

export interface ShareMetaInput {
  readonly locale: Locale
  readonly copy: PageCopy
  /** The request's origin, such as `https://fetchr.hanyang.app`. Null when it could not be read. */
  readonly origin: string | null
  /** True when a known link-preview crawler is asking: it gets the wide card, everyone else the square. */
  readonly crawler: boolean
  readonly pathname: string
  readonly images: ShareImages
}

const ogLocale: Record<Locale, string> = { zh: "zh_CN", en: "en_US" }

/** The square shows only the logo and the wordmark, so its alt text is the brand name in both languages. */
const SQUARE_ALT = "Fetchr"

const imageUrl = (origin: string, image: ShareImage): string => `${origin}${image.path}?v=${image.version}`

/**
 * The title and the meta tags for one page. With no origin the tags that need an absolute address (og:url and
 * the og:image group) are left out; a relative address would be worse than none, because crawlers do not resolve it.
 *
 * The share image depends on who asks. A crawler that draws wide link cards gets the 1200x630 card of the page's
 * language. Anyone else gets the 600x600 square. That default is for WeChat: it crops the og:image of a Moments
 * card to a centred square, which leaves a square untouched, and no user agent is documented for its fetcher, so it
 * is served by default instead of being picked out.
 */
export function shareMeta({ locale, copy, origin, crawler, pathname, images }: ShareMetaInput): MetaTag[] {
  const wide = locale === "en" ? images.ogEn : images.ogZh
  const card = crawler ? wide : images.square
  const tags: MetaTag[] = [
    { title: copy.title },
    { name: "description", content: copy.description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: "Fetchr" },
    { property: "og:title", content: copy.title },
    { property: "og:description", content: copy.description },
    { property: "og:locale", content: ogLocale[locale] },
  ]
  if (origin !== null) {
    tags.push(
      { property: "og:url", content: `${origin}${pathname}${locale === "en" ? "?lang=en" : ""}` },
      { property: "og:image", content: imageUrl(origin, card) },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: String(card.width) },
      { property: "og:image:height", content: String(card.height) },
      { property: "og:image:alt", content: crawler ? copy.shareImageAlt : SQUARE_ALT },
    )
  }
  // X falls back to the og tags above for the title, description and image, so only the card type is needed.
  tags.push({ name: "twitter:card", content: crawler ? "summary_large_image" : "summary" })
  return tags
}

export interface RequestFacts {
  readonly origin: string | null
  /** True when the user agent is a known link-preview crawler. See `isLinkPreviewCrawler`. */
  readonly crawler: boolean
}

/** What a page knows when the request cannot be read: no address to build absolute URLs from, and not a crawler. */
export const NO_REQUEST_FACTS: RequestFacts = { origin: null, crawler: false }

/**
 * What the share tags need from the request. Share metadata must never take a page down, so if `read` throws
 * (no request in scope, an RPC that failed) the answer is no origin and no crawler: the page loses its image
 * tags and nothing else.
 */
export function readRequestFacts(read: () => RequestFacts): RequestFacts {
  try {
    return read()
  } catch {
    return NO_REQUEST_FACTS
  }
}

/**
 * The crawlers that build link previews and draw wide cards, by the name each puts in its user agent. Apple
 * Messages is reported to send an old Safari string with `facebookexternalhit` and `Twitterbot` appended, so it
 * matches too. WeChat is not here: no user agent is documented for its fetcher, and one report says it sends
 * ordinary phone and desktop browser strings, so it is left to the default. Whatever is not on this list gets the
 * square. To show another platform the wide card, add its name here and to the test of the same names.
 */
const LINK_PREVIEW_CRAWLERS = /facebookexternalhit|facebot|twitterbot|slackbot|telegrambot|whatsapp|discordbot|linkedinbot|applebot/i

export function isLinkPreviewCrawler(userAgent: string | null | undefined): boolean {
  return LINK_PREVIEW_CRAWLERS.test(userAgent ?? "")
}
