import type { TikTokFetchDiagnostic } from "./fetch"

export interface TikTokLogEvent {
  readonly outcome: "ok" | "error"
  readonly stage: string
  readonly error?: string
  readonly script?: string
  readonly inputHost?: string
  readonly inputPath?: string
  readonly host?: string
  readonly path?: string
  readonly status?: number
  readonly contentType?: string | null
  readonly bodyLength?: number
  readonly hasUniversalData?: boolean
  readonly hasSigiState?: boolean
  readonly contentTypeHint?: string
}

/** Development log for one TikTok attempt. Host and path only: no query, cookie, or share text. */
export function logTikTok(event: TikTokLogEvent): void {
  if (event.outcome === "ok" && !debugEnabled()) return
  console.info(JSON.stringify({ source: "tiktok", ...event }))
}

export function logFields(diagnostic: TikTokFetchDiagnostic): Pick<
  TikTokLogEvent,
  | "inputHost"
  | "inputPath"
  | "host"
  | "path"
  | "status"
  | "contentType"
  | "bodyLength"
  | "hasUniversalData"
  | "hasSigiState"
  | "contentTypeHint"
> {
  const input = new URL(diagnostic.inputUrl)
  const resolved = new URL(diagnostic.resolvedUrl)
  return {
    inputHost: input.hostname,
    inputPath: input.pathname,
    host: resolved.hostname,
    path: resolved.pathname,
    status: diagnostic.status,
    contentType: diagnostic.contentType,
    bodyLength: diagnostic.bodyLength,
    hasUniversalData: diagnostic.hasUniversalData,
    hasSigiState: diagnostic.hasSigiState,
    contentTypeHint: diagnostic.contentTypeHint,
  }
}

function debugEnabled(): boolean {
  return globalThis.process?.env?.FETCHR_DEBUG === "1"
}
