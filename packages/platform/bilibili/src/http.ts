import type { ExtractFailure } from "@fetchr/core"
import { Effect } from "effect"

export const notFound: ExtractFailure = {
  code: "MEDIA_NOT_FOUND",
  message: "This video was not found.",
}

export function failureForCode(code: number): ExtractFailure | undefined {
  if (code === 0) return undefined
  if (code === -404) return notFound
  return {
    code: "SOURCE_UNAVAILABLE",
    message: "Bilibili could not provide this video.",
  }
}

function parseJson(text: string): unknown {
  return JSON.parse(text)
}

export function readJson(response: Response) {
  return Effect.tryPromise({
    try: async () => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      return parseJson(await response.text())
    },
    catch: () =>
      ({
        code: "SOURCE_UNAVAILABLE",
        message: "Bilibili response could not be read.",
      }) satisfies ExtractFailure,
  })
}
