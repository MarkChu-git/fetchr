/**
 * The watch page puts the archive in `window.__INITIAL_STATE__`.
 * `/x/web-interface/view` answers 412 on many networks. The same public info is still in the HTML.
 * Slice out the JSON here. Do not execute the page script.
 */
export function readVideoData(html: string): unknown {
  const marker = "window.__INITIAL_STATE__="
  const at = html.indexOf(marker)
  if (at < 0) return undefined
  const start = html.indexOf("{", at + marker.length)
  if (start < 0) return undefined
  const json = sliceJsonObject(html, start)
  if (json === undefined) return undefined
  let state: unknown
  try {
    state = JSON.parse(json)
  } catch {
    return undefined
  }
  if (typeof state !== "object" || state === null || !("videoData" in state)) {
    return undefined
  }
  return state.videoData
}

function sliceJsonObject(html: string, start: number): string | undefined {
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < html.length; index += 1) {
    const char = html[index]
    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (char === "\\") {
        escaped = true
        continue
      }
      if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === "{") depth += 1
    if (char === "}") {
      depth -= 1
      if (depth === 0) return html.slice(start, index + 1)
    }
  }
  return undefined
}
