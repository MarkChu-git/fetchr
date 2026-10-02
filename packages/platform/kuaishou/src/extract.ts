import type { ExtractFailure, Extractor } from "@fetchr/core"
import { Effect } from "effect"
import { idFromUrl, match } from "./match"
import { normalize } from "./normalize"

const extract: Extractor["extract"] = (resource, transport) =>
  Effect.gen(function* () {
    if (resource.platform !== "kuaishou" || !match(resource.url)) {
      return yield* Effect.fail(failure("UNSUPPORTED_URL", "URL is not a Kuaishou resource"))
    }
    const response = yield* transport.request(
      new Request(resource.url, {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "Mozilla/5.0 (compatible; Fetchr/0.1)",
        },
      }),
    )
    if (!response.ok) {
      return yield* Effect.fail(
        failure("SOURCE_UNAVAILABLE", `Kuaishou responded with HTTP ${response.status}`),
      )
    }
    const text = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: () => failure("SOURCE_UNAVAILABLE", "Kuaishou response body could not be read"),
    })
    const payload = yield* Effect.try({
      try: () => parseDocument(text),
      catch: () => failure("SCHEMA_CHANGED", "Kuaishou page did not contain a readable payload"),
    })
    const normalized = normalize(resource, payload, resource.id ?? idFromUrl(resource.url))
    if (normalized._tag === "Schema") {
      return yield* Effect.fail(
        failure("SCHEMA_CHANGED", "Kuaishou payload did not match a known schema"),
      )
    }
    if (normalized._tag === "Empty") {
      return yield* Effect.fail(
        failure("MEDIA_NOT_FOUND", "Kuaishou payload did not include playable media"),
      )
    }
    return normalized.post
  })

export const kuaishou: Extractor = {
  platform: "kuaishou",
  match,
  extract,
}

function parseDocument(body: string): unknown {
  const trimmed = body.trim()
  if (trimmed.startsWith("{")) return parseJson(trimmed)
  const apollo = assignedObject(body, "window.__APOLLO_STATE__")
  if (apollo !== undefined) return apollo
  const init = assignedObject(body, "window.INIT_STATE")
  if (init !== undefined) return init
  throw new Error("missing kuaishou state")
}

function assignedObject(source: string, marker: string): unknown {
  let from = 0
  while (from < source.length) {
    const at = source.indexOf(marker, from)
    if (at < 0) return undefined
    let index = at + marker.length
    index = skipSpace(source, index)
    if (source[index] === "=") {
      index = skipSpace(source, index + 1)
      if (source[index] === "{") return readJsonObject(source, index)
    }
    from = at + marker.length
  }
  return undefined
}

function readJsonObject(source: string, start: number): unknown {
  if (source[start] !== "{") throw new Error("expected object")
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < source.length; index++) {
    const char = source[index]
    if (char === undefined) break
    if (inString) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === "\"") inString = false
      continue
    }
    if (char === "\"") {
      inString = true
      continue
    }
    if (char === "{") depth += 1
    else if (char === "}") {
      depth -= 1
      if (depth === 0) return parseJson(source.slice(start, index + 1))
    }
  }
  throw new Error("unterminated object")
}

function skipSpace(source: string, index: number): number {
  let cursor = index
  while (cursor < source.length) {
    const char = source[cursor]
    if (char === undefined || !isSpace(char)) break
    cursor += 1
  }
  return cursor
}

function isSpace(char: string): boolean {
  return char === " " || char === "\n" || char === "\r" || char === "\t"
}

function parseJson(text: string): unknown {
  const value: unknown = JSON.parse(text)
  return value
}

function failure(code: ExtractFailure["code"], message: string): ExtractFailure {
  return { code, message }
}
