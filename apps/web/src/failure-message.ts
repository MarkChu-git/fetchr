import type { ExtractErrorCode } from "@fetchr/core"

export function failureMessage(code: ExtractErrorCode): string {
  switch (code) {
    case "UNSUPPORTED_URL":
    case "INVALID_URL":
      return "这个链接不支持"
    case "PRIVATE_MEDIA":
      return "这条内容是私密的"
    case "LOGIN_REQUIRED":
      return "需要登录才能查看"
    case "MEDIA_NOT_FOUND":
      return "没有找到这条内容"
    case "RATE_LIMITED":
      return "请求太频繁，请稍后再试"
    case "DRM_PROTECTED":
      return "这条内容有版权保护，不能下载"
    case "GEO_BLOCKED":
      return "这个地区看不了这条内容"
    default:
      return "解析失败"
  }
}
