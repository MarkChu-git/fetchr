/**
 * What a page tells the outside world when its link is shared: the title, the description, the Open Graph and
 * Twitter tags, and whether the visitor is inside WeChat. Pure, and Web APIs only (this file ships in the Worker).
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
export interface ShareImages {
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
  readonly pathname: string
  readonly images: ShareImages
}

const ogLocale: Record<Locale, string> = { zh: "zh_CN", en: "en_US" }

const imageUrl = (origin: string, image: ShareImage): string => `${origin}${image.path}?v=${image.version}`

/**
 * The title and the meta tags for one page. With no origin the tags that need an absolute address (og:url and
 * the og:image group) are left out; a relative address would be worse than none, because crawlers do not resolve it.
 */
export function shareMeta({ locale, copy, origin, pathname, images }: ShareMetaInput): MetaTag[] {
  const card = locale === "en" ? images.ogEn : images.ogZh
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
      { property: "og:image:alt", content: copy.shareImageAlt },
    )
  }
  // X falls back to the og tags above for the title, description and image, so only the card type is needed.
  tags.push({ name: "twitter:card", content: "summary_large_image" })
  return tags
}

/** The square image's address, for the picture WeChat's browser is shown. Null without an origin. */
export function squareImageSrc(origin: string | null, images: ShareImages): string | null {
  return origin === null ? null : imageUrl(origin, images.square)
}

export interface RequestFacts {
  readonly origin: string | null
  readonly wechat: boolean
}

/** What a page knows when the request cannot be read: no address to build absolute URLs from, and not WeChat. */
export const NO_REQUEST_FACTS: RequestFacts = { origin: null, wechat: false }

/**
 * What the share tags need from the request. Share metadata must never take a page down, so if `read` throws
 * (no request in scope, an RPC that failed) the answer is no origin and not WeChat: the page loses its image
 * tags and nothing else.
 */
export function readRequestFacts(read: () => RequestFacts): RequestFacts {
  try {
    return read()
  } catch {
    return NO_REQUEST_FACTS
  }
}

/** True inside WeChat's in-app browser, on phones and desktop alike: every build puts MicroMessenger in the user agent. */
export function isWeChatUserAgent(userAgent: string | null | undefined): boolean {
  return /MicroMessenger/i.test(userAgent ?? "")
}
