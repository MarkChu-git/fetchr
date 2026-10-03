import type { CanonicalResource, ExtractFailure, Extractor, MediaPost, Transport } from "@fetchr/core"
import { Effect, Schema } from "effect"

import { failure } from "./errors"
import { readNoteDetailMap, readShareNoteStore, selectNote, toMediaPost } from "./parser"
import { asHttps, isShortLink, match, noteId, resolveShortLink, sharePageUrl } from "./resolver"
import { noteDetailMapFromJson, shareNoteStoreFromJson, type NoteBody } from "./schema"
import {
  anonymousSession,
  hasSession,
  pageRequest,
  type XiaohongshuSession,
} from "./session"

const readBody = (response: Response) =>
  Effect.tryPromise({
    try: () => response.text(),
    catch: () => failure("SOURCE_UNAVAILABLE", "Could not read the page."),
  })

const resolvePayload = (payload: string) =>
  Effect.try({
    try: () => resolveShortLink(payload),
    catch: () => failure("RESOLVE_FAILED", "The link did not resolve to a note URL."),
  })

/**
 * Three different doors reject a page request, and they are not interchangeable:
 * xhs_sec_server means the WAF is throttling this address — a retry usually
 * clears it, but only when the URL actually carried xsec_token. A link without
 * a token can never pass, so it reports LOGIN_REQUIRED instead of asking the
 * user to retry. error_code or website-login is the app gate — the note is
 * gated or private.
 */
const gateFailure = (
  location: string | null,
  session: XiaohongshuSession,
  hadToken: boolean,
): ExtractFailure => {
  if (location !== null && location.includes("xhs_sec_server") && hadToken) {
    return failure("RATE_LIMITED", "The upstream is throttling; retry shortly.", {
      cause: "xhs_sec_server",
    })
  }
  const errorCode = location?.match(/[?&]error_code=(\d+)/)?.[1]
  const loginWall = location !== null && location.includes("website-login")
  if (loginWall || !hasSession(session)) {
    return failure("LOGIN_REQUIRED", "The note needs a signed-in session and a share link.", {
      cause: errorCode ?? location ?? "redirect",
    })
  }
  return failure("MEDIA_NOT_FOUND", "The note could not be opened.", {
    cause: errorCode ?? location ?? "redirect",
  })
}

const resolveResource = (
  resource: CanonicalResource,
  transport: Transport,
  session: XiaohongshuSession,
): Effect.Effect<CanonicalResource, ExtractFailure> =>
  Effect.gen(function* () {
    if (isShortLink(resource.url)) {
      const response = yield* transport.request(pageRequest(asHttps(resource.url), session))
      const location = response.headers.get("location")
      if (location !== null && location.length > 0) {
        return yield* resolvePayload(location)
      }
      if (!response.ok) {
        return yield* Effect.fail(failure("RESOLVE_FAILED", "The link did not resolve."))
      }
      const html = yield* readBody(response)
      return yield* resolvePayload(html)
    }

    const id = noteId(resource.url)
    if (id === undefined) {
      return yield* Effect.fail(
        failure("UNSUPPORTED_URL", "The URL is not a Xiaohongshu note or short link."),
      )
    }
    // The query carries xsec_token; sharePageUrl keeps it while pointing at the
    // anonymous mobile render.
    const source = asHttps(resource.url)
    return { platform: "xiaohongshu", id, url: sharePageUrl(id, source) }
  })

/**
 * The WAF throttle is transient — real batches recovered after a few seconds.
 * One spaced retry clears most of it without turning a hot upstream into a
 * retry storm. Everything else still fails on the first response.
 */
const requestSharePage = (
  url: URL,
  session: XiaohongshuSession,
  transport: Transport,
): Effect.Effect<Response, ExtractFailure> =>
  Effect.gen(function* () {
    const response = yield* transport.request(pageRequest(url, session))
    const location = response.headers.get("location")
    const throttled =
      response.status >= 300 &&
      response.status < 400 &&
      location !== null &&
      location.includes("xhs_sec_server") &&
      url.searchParams.has("xsec_token")
    if (!throttled) return response
    yield* Effect.sleep("800 millis")
    return yield* transport.request(pageRequest(url, session))
  })

const extractWith = (
  session: XiaohongshuSession,
  resource: CanonicalResource,
  transport: Transport,
): Effect.Effect<MediaPost, ExtractFailure> =>
  Effect.gen(function* () {
    const canonical = yield* resolveResource(resource, transport, session)
    const response = yield* requestSharePage(canonical.url, session, transport)
    if (response.status >= 300 && response.status < 400) {
      return yield* Effect.fail(
        gateFailure(
          response.headers.get("location"),
          session,
          canonical.url.searchParams.has("xsec_token"),
        ),
      )
    }
    if (!response.ok) {
      return yield* Effect.fail(failure("SOURCE_UNAVAILABLE", "The page request failed."))
    }
    const html = yield* readBody(response)
    const note = yield* readNote(html, canonical.id)
    if (note === undefined) {
      return yield* Effect.fail(
        failure("MEDIA_NOT_FOUND", "The note could not be opened from this link.", {
          cause: hasSession(session) ? "state-missing" : "no-token",
        }),
      )
    }
    return yield* toMediaPost(note, canonical)
  })

/**
 * Two renders carry the note: the mobile share page (state.noteData.data.noteData,
 * anonymous) and the signed-in desktop page (note.noteDetailMap). Try the mobile
 * store first since the request presents as a phone.
 */
const readNote = (
  html: string,
  wanted: string | undefined,
): Effect.Effect<NoteBody | undefined, ExtractFailure> =>
  Effect.gen(function* () {
    const shareJson = readShareNoteStore(html)
    if (shareJson !== undefined) {
      const store = yield* Effect.mapError(
        Schema.decodeUnknownEffect(shareNoteStoreFromJson)(shareJson),
        () => failure("SCHEMA_CHANGED", "Share note state did not match the expected shape."),
      )
      if (store.data?.noteData !== undefined) return store.data.noteData
    }
    const mapJson = readNoteDetailMap(html)
    if (mapJson === undefined) return undefined
    const map = yield* Effect.mapError(
      Schema.decodeUnknownEffect(noteDetailMapFromJson)(mapJson),
      () => failure("SCHEMA_CHANGED", "Embedded state did not match the expected shape."),
    )
    return selectNote(map, wanted)
  })

export const createXiaohongshuExtractor = (
  session: XiaohongshuSession = anonymousSession,
): Extractor => ({
  platform: "xiaohongshu",
  match,
  extract: (resource, transport) => extractWith(session, resource, transport),
})

export const xiaohongshuExtractor = createXiaohongshuExtractor()
