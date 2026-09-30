import type { ExtractErrorCode, ExtractFailure } from "@fetchr/core"

export const failure = (code: ExtractErrorCode, message: string): ExtractFailure => ({
  code,
  message,
})
