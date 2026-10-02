import type { ExtractErrorCode, MediaPost } from "@fetchr/core"

export type ExtractOutcome =
  | { readonly ok: true; readonly post: MediaPost }
  | { readonly ok: false; readonly code: ExtractErrorCode; readonly challenge: boolean }

interface ExtractBody {
  readonly ok?: boolean
  readonly post?: MediaPost
  readonly code?: ExtractErrorCode
  readonly challenge?: boolean
}

function isExtractBody(value: unknown): value is ExtractBody {
  return typeof value === "object" && value !== null
}

/** Extraction runs on the Worker. Platform requests, signing, and rate limits do not belong in the browser. */
export async function runExtract(
  url: string,
  turnstileToken?: string,
): Promise<ExtractOutcome> {
  let response: Response
  try {
    response = await fetch("/api/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url,
        ...(turnstileToken === undefined ? {} : { turnstileToken }),
      }),
    })
  } catch {
    return { ok: false, code: "EXTRACTOR_BROKEN", challenge: false }
  }
  let body: ExtractBody
  try {
    const raw: unknown = await response.json()
    if (!isExtractBody(raw)) throw new Error("not an extract body")
    body = raw
  } catch {
    return { ok: false, code: "EXTRACTOR_BROKEN", challenge: false }
  }
  if (body.ok === true && body.post !== undefined) {
    return { ok: true, post: body.post }
  }
  return {
    ok: false,
    code: body.code ?? "EXTRACTOR_BROKEN",
    challenge: body.challenge === true,
  }
}
