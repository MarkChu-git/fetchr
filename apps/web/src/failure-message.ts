import type { ExtractErrorCode } from "@fetchr/core"
import type { Locale } from "./i18n"

const failureCopy = {
  zh: {
    UNSUPPORTED_URL: "这个链接不支持",
    INVALID_URL: "这个链接不支持",
    PRIVATE_MEDIA: "这条内容是私密的",
    LOGIN_REQUIRED: "需要登录才能查看",
    MEDIA_NOT_FOUND: "没有找到这条内容",
    PAYLOAD_MISSING: "页面里没有可下载的内容",
    UPSTREAM_BLOCKED: "上游暂时拦截了这次请求",
    SCHEMA_CHANGED: "页面数据格式变了",
    RESOLVE_FAILED: "这个链接没有解析成功",
    SOURCE_UNAVAILABLE: "上游没有返回可用页面",
    UPSTREAM_TIMEOUT: "上游没有及时响应",
    RATE_LIMITED: "请求太频繁，请稍后再试",
    DRM_PROTECTED: "这条内容有版权保护，不能下载",
    GEO_BLOCKED: "这个地区看不了这条内容",
    EXTRACTOR_BROKEN: "解析失败",
  },
  en: {
    UNSUPPORTED_URL: "This link is not supported",
    INVALID_URL: "This link is not supported",
    PRIVATE_MEDIA: "This post is private",
    LOGIN_REQUIRED: "You need to sign in to view this",
    MEDIA_NOT_FOUND: "This post was not found",
    PAYLOAD_MISSING: "This page has nothing to download",
    UPSTREAM_BLOCKED: "The upstream blocked this request",
    SCHEMA_CHANGED: "The page data format changed",
    RESOLVE_FAILED: "This link did not resolve",
    SOURCE_UNAVAILABLE: "The upstream sent no usable page",
    UPSTREAM_TIMEOUT: "The upstream did not respond in time",
    RATE_LIMITED: "Too many requests. Try again in a moment.",
    DRM_PROTECTED: "This post is protected and cannot be downloaded",
    GEO_BLOCKED: "This region cannot play this post",
    EXTRACTOR_BROKEN: "Could not parse this link",
  },
} as const satisfies Record<Locale, Record<ExtractErrorCode, string>>

export function failureMessage(code: ExtractErrorCode, locale: Locale = "zh"): string {
  return failureCopy[locale][code]
}
