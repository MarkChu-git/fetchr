export interface XiaohongshuSession {
  readonly cookies: Readonly<Record<string, string>>
}

export const anonymousSession: XiaohongshuSession = { cookies: {} }

/**
 * Escape hatch: if the anonymous mobile share render ever stops working, a
 * signed-in cookie header ("web_session=…") unlocks the desktop page instead.
 */
export const sessionFromCookieHeader = (header: string | undefined): XiaohongshuSession => {
  if (header === undefined) return anonymousSession
  const cookies: Record<string, string> = {}
  for (const part of header.split(";")) {
    const eq = part.indexOf("=")
    if (eq <= 0) continue
    const name = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (name.length === 0 || value.length === 0) continue
    cookies[name] = value
  }
  return { cookies }
}

export const hasSession = (session: XiaohongshuSession): boolean =>
  Object.keys(session.cookies).length > 0

const cookieHeader = (session: XiaohongshuSession): string | undefined => {
  const parts: Array<string> = []
  for (const [name, value] of Object.entries(session.cookies)) {
    if (name.length === 0) continue
    parts.push(`${name}=${value}`)
  }
  if (parts.length === 0) return undefined
  return parts.join("; ")
}

/**
 * Shared links are meant to be opened on a phone, and the mobile share render
 * serves the note anonymously. Desktop clients get the security gate instead,
 * so the request always presents as a phone browser.
 */
const mobileUserAgent =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"

export const pageRequest = (
  url: URL,
  session: XiaohongshuSession = anonymousSession,
): Request => {
  const headers = new Headers({
    "user-agent": mobileUserAgent,
    accept: "text/html,application/xhtml+xml",
    "accept-language": "zh-CN,zh;q=0.9",
  })
  const cookie = cookieHeader(session)
  if (cookie !== undefined) headers.set("cookie", cookie)
  return new Request(url, { method: "GET", headers, redirect: "manual" })
}
