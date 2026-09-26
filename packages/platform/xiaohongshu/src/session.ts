export interface XiaohongshuSession {
  readonly cookies: Readonly<Record<string, string>>
}

export const anonymousSession: XiaohongshuSession = { cookies: {} }

export const cookieHeader = (session: XiaohongshuSession): string | undefined => {
  const parts: Array<string> = []
  for (const [name, value] of Object.entries(session.cookies)) {
    if (name.length === 0) continue
    parts.push(`${name}=${value}`)
  }
  if (parts.length === 0) return undefined
  return parts.join("; ")
}

export const pageRequest = (
  url: URL,
  session: XiaohongshuSession = anonymousSession,
): Request => {
  const headers = new Headers()
  const cookie = cookieHeader(session)
  if (cookie !== undefined) headers.set("cookie", cookie)
  return new Request(url, { method: "GET", headers, redirect: "manual" })
}
