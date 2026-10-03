import type { ExtractErrorCode, ExtractFailure } from "@fetchr/core"

export const failure = (
  code: ExtractErrorCode,
  message: string,
  options?: { readonly cause?: string },
): ExtractFailure => ({
  code,
  message,
  ...(options?.cause === undefined ? {} : { cause: options.cause }),
})
