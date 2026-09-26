import type { ExtractErrorCode, ExtractFailure } from "@fetchr/core"

export function failure(
  code: ExtractErrorCode,
  message: string,
): ExtractFailure {
  return { code, message }
}
