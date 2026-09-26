import type { Delivery } from "@fetchr/core"

// The page cannot send these. The worker replaces the pending token when it signs.
const proxyHeader = /^(authorization|cookie|referer|user-agent)$/i

export function deliveryFor(
  url: string,
  headers: Readonly<Record<string, string>> | undefined,
): Delivery {
  if (headers !== undefined) {
    for (const name of Object.keys(headers)) {
      if (proxyHeader.test(name)) return { type: "proxy", token: "pending" }
    }
  }
  return { type: "direct", url }
}
