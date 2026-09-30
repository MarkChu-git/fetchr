import { followRedirects, type FollowedResponse, type Transport } from "@fetchr/core"
import type { Effect } from "effect"
import type { ExtractFailure } from "@fetchr/core"
import { matchTikTokUrl } from "./matcher"

/** Resolve a TikTok URL, including short links, and keep the final response. */
export function resolveTikTok(
  input: URL,
  transport: Transport,
): Effect.Effect<FollowedResponse, ExtractFailure> {
  return followRedirects(input, transport, {
    allow: matchTikTokUrl,
  })
}
