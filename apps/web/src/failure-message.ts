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
    default:
      return "解析失败"
  }
}
