import {
  extract,
  fixtureExtractor,
  type MediaPost,
  type Transport,
} from "@fetchr/core"
import { Effect } from "effect"
import { failureMessage } from "./failure-message"

const fixtureTransport: Transport = {
  request: () =>
    Effect.fail({
      code: "SOURCE_UNAVAILABLE",
      message: "fixture transport is not called",
    }),
}

export type ExtractOutcome =
  | { readonly ok: true; readonly post: MediaPost }
  | { readonly ok: false; readonly message: string }

export async function runExtract(url: string): Promise<ExtractOutcome> {
  return Effect.runPromise(
    Effect.match(extract(url, fixtureTransport, [fixtureExtractor]), {
      onFailure: (failure) => ({
        ok: false as const,
        message: failureMessage(failure.code),
      }),
      onSuccess: (post) => ({ ok: true as const, post }),
    }),
  )
}
