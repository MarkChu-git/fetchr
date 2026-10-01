import { platforms, type Platform } from "@fetchr/core"
import { ProxyTokenError } from "./errors.ts"
import { assertPublicHttpUrl } from "./public-url.ts"

// Fixed at sign time. The token carries expiry only, so verify compares `now` to that field.
// 30 minutes: a result page is browsed and downloaded over minutes, and the 5 minute window expired mid-session.
const proxyTokenTtlMs = 30 * 60 * 1000

export interface ProxyTokenClaims {
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  /** Unix time in milliseconds. */
  readonly expiry: number
  readonly platform: Platform
}

export interface SignProxyTokenInput {
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  readonly platform: Platform
  readonly issuedAt: number
  readonly secret: string
}

export interface VerifyProxyTokenInput {
  readonly token: string
  readonly now: number
  readonly secret: string
}

function isPlatform(value: unknown): value is Platform {
  return platforms.some((platform) => platform === value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function assertAttachableHeader(name: string, value: string): void {
  if (
    name.length === 0 ||
    name === "__proto__" ||
    name === "prototype" ||
    name === "constructor" ||
    /[\r\n\0]/.test(name) ||
    /[\r\n\0]/.test(value)
  ) {
    throw new ProxyTokenError("invalid_token", "header cannot be attached")
  }
}

function canonicalHeaders(headers: unknown): Record<string, string> {
  if (!isRecord(headers)) {
    throw new ProxyTokenError("invalid_token", "headers must be an object")
  }
  const names = Object.keys(headers).sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  )
  const canonical: Record<string, string> = {}
  for (const name of names) {
    const value = headers[name]
    if (typeof value !== "string") {
      throw new ProxyTokenError("invalid_token", "header values must be strings")
    }
    assertAttachableHeader(name, value)
    Object.defineProperty(canonical, name, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    })
  }
  return canonical
}

function expiryFrom(issuedAt: number): number {
  if (!Number.isSafeInteger(issuedAt)) {
    throw new ProxyTokenError(
      "invalid_token",
      "issuedAt must be a unix millisecond timestamp",
    )
  }
  const expiry = issuedAt + proxyTokenTtlMs
  if (!Number.isSafeInteger(expiry)) {
    throw new ProxyTokenError("invalid_token", "expiry is out of range")
  }
  return expiry
}

function encodePayload(claims: ProxyTokenClaims): string {
  return JSON.stringify({
    url: claims.url,
    headers: canonicalHeaders(claims.headers),
    expiry: claims.expiry,
    platform: claims.platform,
  })
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

function decodeBase64Url(value: string): Uint8Array {
  if (
    value.length === 0 ||
    value.length % 4 === 1 ||
    !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    throw new ProxyTokenError("invalid_token", "proxy token is invalid")
  }
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4)
  let binary: string
  try {
    binary = atob(padded.replaceAll("-", "+").replaceAll("_", "/"))
  } catch {
    throw new ProxyTokenError("invalid_token", "proxy token is invalid")
  }
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function bufferSource(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  if (secret.length === 0) {
    throw new ProxyTokenError("invalid_token", "proxy token secret is empty")
  }
  return crypto.subtle.importKey(
    "raw",
    bufferSource(new TextEncoder().encode(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  )
}

async function hmacSha256(secret: string, payload: string): Promise<Uint8Array> {
  const key = await hmacKey(secret, "sign")
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    bufferSource(new TextEncoder().encode(payload)),
  )
  return new Uint8Array(signature)
}

function readClaims(payload: string): ProxyTokenClaims {
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch {
    throw new ProxyTokenError("invalid_token", "proxy token payload is invalid")
  }
  if (!isRecord(parsed)) {
    throw new ProxyTokenError("invalid_token", "proxy token payload is invalid")
  }
  const keys = Object.keys(parsed).sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  )
  const expected = ["expiry", "headers", "platform", "url"]
  if (
    keys.length !== expected.length ||
    expected.some((key, index) => keys[index] !== key)
  ) {
    throw new ProxyTokenError("invalid_token", "proxy token payload is invalid")
  }
  const url = parsed.url
  const expiry = parsed.expiry
  const platform = parsed.platform
  if (typeof url !== "string" || typeof expiry !== "number" || !Number.isSafeInteger(expiry)) {
    throw new ProxyTokenError("invalid_token", "proxy token payload is invalid")
  }
  if (!isPlatform(platform)) {
    throw new ProxyTokenError("invalid_token", "proxy token payload is invalid")
  }
  return {
    url,
    headers: canonicalHeaders(parsed.headers),
    expiry,
    platform,
  }
}

async function authenticatedPayload(token: string, secret: string): Promise<string> {
  if (typeof token !== "string" || typeof secret !== "string") {
    throw new ProxyTokenError("invalid_token", "proxy token is invalid")
  }
  const parts = token.split(".")
  if (parts.length !== 2) {
    throw new ProxyTokenError("invalid_token", "proxy token is invalid")
  }
  const payloadPart = parts[0]
  const signaturePart = parts[1]
  if (payloadPart === undefined || signaturePart === undefined) {
    throw new ProxyTokenError("invalid_token", "proxy token is invalid")
  }
  const payloadBytes = decodeBase64Url(payloadPart)
  const signatureBytes = decodeBase64Url(signaturePart)
  if (signatureBytes.byteLength !== 32) {
    throw new ProxyTokenError("invalid_token", "proxy token is invalid")
  }
  const key = await hmacKey(secret, "verify")
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    bufferSource(signatureBytes),
    bufferSource(payloadBytes),
  )
  if (!valid) {
    throw new ProxyTokenError("invalid_token", "proxy token signature is invalid")
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(payloadBytes)
  } catch {
    throw new ProxyTokenError("invalid_token", "proxy token payload is invalid")
  }
}

export async function sign(input: SignProxyTokenInput): Promise<string> {
  const expiry = expiryFrom(input.issuedAt)
  if (!isPlatform(input.platform)) {
    throw new ProxyTokenError("invalid_token", "platform is not recognized")
  }
  assertPublicHttpUrl(input.url)
  const payload = encodePayload({
    url: input.url,
    headers: input.headers,
    expiry,
    platform: input.platform,
  })
  const signature = await hmacSha256(input.secret, payload)
  return `${encodeBase64Url(new TextEncoder().encode(payload))}.${encodeBase64Url(signature)}`
}

// The upstream URL is read from the token. This function has no URL parameter.
export async function verify(input: VerifyProxyTokenInput): Promise<ProxyTokenClaims> {
  if (!Number.isSafeInteger(input.now)) {
    throw new ProxyTokenError(
      "invalid_token",
      "now must be a unix millisecond timestamp",
    )
  }
  const claims = readClaims(await authenticatedPayload(input.token, input.secret))
  assertPublicHttpUrl(claims.url)
  if (input.now >= claims.expiry) {
    throw new ProxyTokenError("expired", "proxy token has expired")
  }
  return claims
}
