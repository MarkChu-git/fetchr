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
    case "PAYLOAD_MISSING":
      return "页面里没有可下载的内容"
    case "UPSTREAM_BLOCKED":
      return "上游暂时拦截了这次请求"
    case "SCHEMA_CHANGED":
      return "页面数据格式变了"
    case "RESOLVE_FAILED":
      return "这个链接没有解析成功"
    case "SOURCE_UNAVAILABLE":
      return "上游没有返回可用页面"
    case "UPSTREAM_TIMEOUT":
      return "上游没有及时响应"
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
