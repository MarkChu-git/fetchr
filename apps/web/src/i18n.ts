import type { Platform } from "@fetchr/core"

export const locales = ["zh", "en"] as const
export type Locale = (typeof locales)[number]

export const localeCookie = "fetchr_locale"

export function localeFromSearch(value: string | null | undefined): Locale {
  return value === "en" ? "en" : "zh"
}

/** The page sets this cookie when the visitor switches language. A missing cookie stays Chinese. */
export function localeFromCookie(header: string | null): Locale {
  if (header === null) return "zh"
  const match = /(?:^|;\s*)fetchr_locale=(zh|en)(?:;|$)/.exec(header)
  return match?.[1] === "en" ? "en" : "zh"
}

export function htmlLang(locale: Locale): "zh-CN" | "en" {
  return locale === "en" ? "en" : "zh-CN"
}

export interface PageCopy {
  readonly publicLink: string
  readonly intro: string
  readonly description: string
  readonly pasteLabel: string
  readonly submit: string
  readonly extracting: string
  readonly emptyTitle: string
  readonly emptyDescription: string
  readonly download: string
  readonly combine: string
  readonly fileUnreadable: string
  readonly combineUnreadable: string
  readonly combineFailed: string
  readonly downloadInvalid: string
  readonly redirectInvalid: string
  readonly redirectRejected: string
  readonly redirectTooMany: string
  readonly platforms: readonly string[]
  readonly platform: Record<Platform, string>
  manifest(protocol: string): string
}

const zhPlatform = {
  fixture: "示例",
  youtube: "YouTube",
  xiaohongshu: "小红书",
  douyin: "抖音",
  instagram: "Instagram",
  tiktok: "TikTok",
  kuaishou: "快手",
  bilibili: "哔哩哔哩",
  twitter: "X",
} as const satisfies Record<Platform, string>

const enPlatform = {
  fixture: "Example",
  youtube: "YouTube",
  xiaohongshu: "Xiaohongshu",
  douyin: "Douyin",
  instagram: "Instagram",
  tiktok: "TikTok",
  kuaishou: "Kuaishou",
  bilibili: "Bilibili",
  twitter: "X",
} as const satisfies Record<Platform, string>

const copy = {
  zh: {
    publicLink: "公开链接",
    intro: "贴一条公开分享链接，先在这里看，再保存。",
    description: "粘贴链接，解析并下载社交媒体上的视频、图片和音频。",
    pasteLabel: "粘贴链接",
    submit: "解析",
    extracting: "正在解析",
    emptyTitle: "还没有内容",
    emptyDescription: "解析之后，视频会出现在这里。",
    download: "下载",
    combine: "合成并下载",
    fileUnreadable: "浏览器读不到这个文件",
    combineUnreadable: "浏览器读不到这两路字节，无法合成",
    combineFailed: "合成失败",
    downloadInvalid: "下载链接无效",
    redirectInvalid: "上游跳转无效",
    redirectRejected: "上游跳转被拒绝",
    redirectTooMany: "上游跳转过多",
    platforms: ["抖音", "哔哩哔哩", "YouTube", "X"],
    platform: zhPlatform,
    manifest: (protocol: string) => `这是一份 ${protocol} 清单`,
  },
  en: {
    publicLink: "Public link",
    intro: "Paste a public share link. Watch it here, then save it.",
    description: "Paste a link to extract and download videos, images, and audio from social media.",
    pasteLabel: "Paste link",
    submit: "Extract",
    extracting: "Extracting",
    emptyTitle: "Nothing here yet",
    emptyDescription: "After you extract a link, the video shows up here.",
    download: "Download",
    combine: "Combine and download",
    fileUnreadable: "The browser could not read this file",
    combineUnreadable: "The browser could not read the picture and audio, so they cannot be combined",
    combineFailed: "Combining failed",
    downloadInvalid: "This download link is not valid",
    redirectInvalid: "The upstream redirect is not valid",
    redirectRejected: "The upstream redirect was rejected",
    redirectTooMany: "Too many upstream redirects",
    platforms: ["Douyin", "Bilibili", "YouTube", "X"],
    platform: enPlatform,
    manifest: (protocol: string) => `This is a ${protocol} manifest`,
  },
} as const satisfies Record<Locale, PageCopy>

export function pageCopy(locale: Locale): PageCopy {
  return copy[locale]
}
