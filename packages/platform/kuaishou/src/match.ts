const idPattern = /^[0-9A-Za-z]+$/

export function match(url: URL): boolean {
  return shortCode(url) !== undefined || shortVideoId(url) !== undefined
}

export function idFromUrl(url: URL): string | undefined {
  return shortVideoId(url) ?? shortCode(url)
}

function shortCode(url: URL): string | undefined {
  if (!isHttp(url) || url.hostname !== "v.kuaishou.com") return undefined
  const [code, extra] = pathParts(url)
  if (code === undefined || extra !== undefined || !idPattern.test(code)) return undefined
  return code
}

function shortVideoId(url: URL): string | undefined {
  if (!isHttp(url) || url.hostname !== "www.kuaishou.com") return undefined
  const [kind, id, extra] = pathParts(url)
  if (kind !== "short-video" || id === undefined || extra !== undefined) return undefined
  if (!idPattern.test(id)) return undefined
  return id
}

function pathParts(url: URL): readonly string[] {
  return url.pathname.split("/").filter((part) => part.length > 0)
}

function isHttp(url: URL): boolean {
  return url.protocol === "https:" || url.protocol === "http:"
}
