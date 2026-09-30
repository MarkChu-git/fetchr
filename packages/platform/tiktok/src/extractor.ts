import { Effect, Schema } from "effect"
import type { ExtractFailure, Extractor } from "@fetchr/core"
import { tiktokFailure } from "./errors"
import { diagnoseTikTokFetch, isBlockedTikTokResponse, isHtmlContent } from "./fetch"
import { logFields, logTikTok, type TikTokLogEvent } from "./log"
import { isTikTokShortLink, matchTikTokUrl } from "./matcher"
import { mediaPostFromTikTokPage, readRehydration, type ScriptExtraction } from "./parser"
import { resolveTikTok } from "./resolver"
import { TikTokPage } from "./schema"

const redirectCauses = new Set([
  "blocked-target",
  "redirect-not-allowed",
  "redirect-loop",
  "redirect-too-many",
  "redirect-bad-location",
])

export const tiktokExtractor: Extractor = {
  platform: "tiktok",
  match: matchTikTokUrl,
  extract: (resource, transport) =>
    Effect.gen(function* () {
      if (!matchTikTokUrl(resource.url)) {
        return yield* failAt("match", tiktokFailure("UNSUPPORTED_URL", "URL is not a TikTok link"))
      }
      const followed = yield* resolveTikTok(resource.url, transport).pipe(
        Effect.mapError((failure) => redirectFailure(resource.url, failure)),
      )
      const body = yield* Effect.tryPromise({
        try: () => followed.response.text(),
        catch: (): ExtractFailure =>
          tiktokFailure("UPSTREAM_FETCH_FAILED", "TikTok response body could not be read"),
      })
      const diagnostic = diagnoseTikTokFetch(
        resource.url,
        followed.url,
        followed.response.status,
        followed.response.headers.get("content-type"),
        body,
      )
      const fields = logFields(diagnostic)
      const extraction = yield* Effect.tryPromise({
        try: () => readRehydration(body),
        catch: (): ExtractFailure =>
          tiktokFailure("REHYDRATION_INVALID_JSON", "TikTok page data could not be read"),
      })
      const failed = failureForPage(followed.response, body, extraction)
      if (failed !== undefined) {
        logTikTok({
          outcome: "error",
          stage: "parse",
          error: failed.cause ?? failed.code,
          script: extraction.status,
          ...fields,
        })
        return yield* Effect.fail(failed)
      }
      if (extraction.status !== "json") {
        return yield* failAt(
          "parse",
          tiktokFailure("REHYDRATION_NOT_FOUND", "TikTok page did not include rehydration data"),
          { script: extraction.status, ...fields },
        )
      }
      const page = yield* Schema.decodeUnknownEffect(TikTokPage)(extraction.value).pipe(
        Effect.mapError(() => {
          logTikTok({
            outcome: "error",
            stage: "schema",
            error: "SCHEMA_CHANGED",
            script: "json",
            ...fields,
          })
          return tiktokFailure(
            "SCHEMA_CHANGED",
            "TikTok page data does not match the expected shape",
          )
        }),
      )
      const parsed = mediaPostFromTikTokPage(page, followed.url.href)
      if ("failure" in parsed) {
        logTikTok({
          outcome: "error",
          stage: "schema",
          error: parsed.failure.cause ?? parsed.failure.code,
          script: "json",
          ...fields,
        })
        return yield* Effect.fail(parsed.failure)
      }
      logTikTok({ outcome: "ok", stage: "done", script: "json", ...fields })
      return parsed.post
    }),
}

function failureForPage(
  response: Response,
  body: string,
  extraction: ScriptExtraction,
): ExtractFailure | undefined {
  const hasUniversalData = body.includes("__UNIVERSAL_DATA_FOR_REHYDRATION__")
  if (isBlockedTikTokResponse(response.status, body, hasUniversalData)) {
    return tiktokFailure("UPSTREAM_BLOCKED", "TikTok returned a challenge instead of the post")
  }
  if (!response.ok) {
    return tiktokFailure(
      "UPSTREAM_FETCH_FAILED",
      `TikTok responded with HTTP ${response.status}`,
    )
  }
  if (!isHtmlContent(response.headers.get("content-type")) && !hasUniversalData) {
    return tiktokFailure("UPSTREAM_FETCH_FAILED", "TikTok response was not an HTML page")
  }
  switch (extraction.status) {
    case "not-found":
      return tiktokFailure(
        "REHYDRATION_NOT_FOUND",
        "TikTok page did not include rehydration data",
      )
    case "empty":
      return tiktokFailure("REHYDRATION_EMPTY", "TikTok rehydration data was empty")
    case "invalid-json":
      return tiktokFailure(
        "REHYDRATION_INVALID_JSON",
        "TikTok rehydration data was not valid JSON",
      )
    case "json":
      return undefined
  }
}

function redirectFailure(input: URL, failure: ExtractFailure): ExtractFailure {
  if (failure.code === "UPSTREAM_TIMEOUT") {
    logTikTok({
      outcome: "error",
      stage: "fetch",
      error: failure.code,
      inputHost: input.hostname,
      inputPath: input.pathname,
    })
    return failure
  }
  const cause = failure.cause
  if (
    (cause !== undefined && redirectCauses.has(cause)) ||
    isTikTokShortLink(input)
  ) {
    logTikTok({
      outcome: "error",
      stage: "redirect",
      error: "SHORT_LINK_RESOLVE_FAILED",
      inputHost: input.hostname,
      inputPath: input.pathname,
    })
    return tiktokFailure(
      "SHORT_LINK_RESOLVE_FAILED",
      "TikTok link did not resolve to a TikTok page",
    )
  }
  logTikTok({
    outcome: "error",
    stage: "fetch",
    error: "UPSTREAM_FETCH_FAILED",
    inputHost: input.hostname,
    inputPath: input.pathname,
  })
  return tiktokFailure("UPSTREAM_FETCH_FAILED", failure.message)
}

function failAt(
  stage: string,
  failure: ExtractFailure,
  extra?: Omit<TikTokLogEvent, "outcome" | "stage" | "error">,
): Effect.Effect<never, ExtractFailure> {
  logTikTok({
    outcome: "error",
    stage,
    error: failure.cause ?? failure.code,
    ...extra,
  })
  return Effect.fail(failure)
}
