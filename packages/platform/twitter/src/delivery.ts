import { unsignedProxy, type Delivery } from "@fetchr/core"

// The browser cannot send these headers. Cookie and Authorization stay out of the token so a login is never signed into it.
const proxyHeader = /^(authorization|cookie|referer|user-agent)$/i

export function deliveryFor(
  url: string,
  headers: Readonly<Record<string, string>> | undefined,
): Delivery {
  if (headers !== undefined) {
    for (const name of Object.keys(headers)) {
      if (proxyHeader.test(name)) {
        return unsignedProxy(url, { Referer: "https://x.com/" })
      }
    }
  }
  return { type: "direct", url }
}
