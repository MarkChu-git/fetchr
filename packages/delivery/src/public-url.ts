import { isBlockedHostname } from "@fetchr/core"
import { ProxyTokenError } from "./errors.ts"

export function assertPublicHttpUrl(input: string): URL {
  // The class is the ASCII controls that must never reach the upstream fetch.
  // oxlint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(input)) {
    throw new ProxyTokenError("forbidden_target", "upstream URL is not public http(s)")
  }
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new ProxyTokenError("forbidden_target", "upstream URL is not public http(s)")
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ProxyTokenError("forbidden_target", "upstream URL is not public http(s)")
  }
  if (isBlockedHostname(url.hostname)) {
    throw new ProxyTokenError("forbidden_target", "upstream URL is not a public target")
  }
  return url
}
