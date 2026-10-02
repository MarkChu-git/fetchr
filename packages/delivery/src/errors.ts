const proxyTokenErrorCodes = [
  "invalid_token",
  "expired",
  "forbidden_target",
] as const

export type ProxyTokenErrorCode = (typeof proxyTokenErrorCodes)[number]

export class ProxyTokenError extends Error {
  readonly code: ProxyTokenErrorCode

  constructor(code: ProxyTokenErrorCode, message: string) {
    super(message)
    this.name = "ProxyTokenError"
    this.code = code
  }
}
