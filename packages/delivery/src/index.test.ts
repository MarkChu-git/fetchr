import { describe, expect, test } from "bun:test"
import type { Platform } from "@fetchr/core"
import {
  assertPublicHttpUrl,
  ProxyTokenError,
  sign,
  verify,
} from "./index.ts"

const secret = "test-secret"
const issuedAt = 1_700_000_000_000
const expiry = 1_700_000_300_000
const upstream = "https://cdn.example.com/video.mp4"
const headers: Readonly<Record<string, string>> = {
  Referer: "https://www.bilibili.com",
  "User-Agent": "fetchr",
}

function flipCharacter(value: string, index: number): string {
  const current = value[index]
  if (current === undefined) return value
  const replacement = current === "A" ? "B" : "A"
  return value.slice(0, index) + replacement + value.slice(index + 1)
}

function signToken(overrides?: {
  readonly url?: string
  readonly headers?: Readonly<Record<string, string>>
  readonly platform?: Platform
  readonly issuedAt?: number
  readonly secret?: string
}) {
  return sign({
    url: overrides?.url ?? upstream,
    headers: overrides?.headers ?? headers,
    platform: overrides?.platform ?? "bilibili",
    issuedAt: overrides?.issuedAt ?? issuedAt,
    secret: overrides?.secret ?? secret,
  })
}

describe("assertPublicHttpUrl", () => {
  test("accepts a public https URL", () => {
    const url = assertPublicHttpUrl("https://cdn.example.com/video.mp4?x=1")
    expect(url.protocol).toBe("https:")
    expect(url.hostname).toBe("cdn.example.com")
    expect(url.pathname).toBe("/video.mp4")
  })

  test("accepts public http(s) names and addresses", () => {
    const allowed = [
      "http://cdn.example.com/video.mp4",
      "https://cdn.example.com:8443/video.mp4",
      "https://notlocalhost.example/a",
      "https://localhost.example.com/a",
      "https://example.local.com/a",
      "https://example.com./a",
      "http://8.8.8.8/v",
      "http://1.1.1.1/v",
      "http://172.15.255.255/a",
      "http://172.32.0.1/a",
      "http://11.0.0.1/a",
      "http://9.255.255.255/a",
      "http://192.167.0.1/a",
      "http://192.169.0.1/a",
      "http://169.253.169.254/a",
      "http://169.255.0.1/a",
      "https://[2001:4860:4860::8888]/",
      "https://[2001:db8::1]/",
      "https://[::ffff:8.8.8.8]/",
      "http://[fb00::1]/",
      "http://[fe7f::1]/",
    ]
    for (const input of allowed) {
      try {
        const url = assertPublicHttpUrl(input)
        expect(url.protocol === "http:" || url.protocol === "https:").toBe(true)
      } catch (error) {
        throw new Error(
          `expected ${input} to be public, got ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        )
      }
    }
  })

  test("rejects non-http schemes, localhost, private networks, and metadata", () => {
    const rejected = [
      "ftp://cdn.example.com/a",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "ws://cdn.example.com/a",
      "not a url",
      "",
      "https://cdn.example.com/a\nb",
      "http://localhost/a",
      "http://LOCALHOST/a",
      "http://localhost./a",
      "http://localhost%2e/a",
      "http://foo.local/a",
      "http://Foo.LOCAL/a",
      "http://foo.local./a",
      "http://foo.local%2e/a",
      "http://0.0.0.0/a",
      "http://0/a",
      "http://127.0.0.1/a",
      "http://127.0.0.2/a",
      "http://127.1/a",
      "http://2130706433/a",
      "http://0x7f.0.0.1/a",
      "http://0x7f000001/a",
      "http://0177.0.0.1/a",
      "http://10.0.0.1/a",
      "http://10.255.255.255/a",
      "http://10.1/a",
      "http://172.16.0.0/a",
      "http://172.31.255.255/a",
      "http://192.168.0.1/a",
      "http://192.168.1/a",
      "http://3232235777/a",
      "http://169.254.0.1/a",
      "http://169.254.169.254/latest/meta-data",
      "http://user:pass@192.168.1.1/secret",
      "http://[::]/a",
      "http://[::1]/a",
      "http://[0:0:0:0:0:0:0:1]/a",
      "https://[::1]/a",
      "http://[fc00::1]/a",
      "http://[fd00::1]/a",
      "http://[fdff::1]/a",
      "http://[fe80::1]/a",
      "http://[fe80::]/a",
      "http://[fec0::1]/a",
      "http://[febf::1]/a",
      "http://[::ffff:127.0.0.1]/a",
      "http://[::ffff:10.0.0.1]/a",
      "http://[::ffff:192.168.1.1]/a",
      "http://[::ffff:169.254.169.254]/a",
      "http://[0:0:0:0:0:ffff:169.254.169.254]/a",
      "http://[::10.0.0.1]/a",
      "http://[::a00:1]/a",
      "http://[::127.0.0.1]/a",
    ]
    for (const input of rejected) {
      let thrown: unknown
      try {
        assertPublicHttpUrl(input)
      } catch (error) {
        thrown = error
      }
      if (!(thrown instanceof ProxyTokenError) || thrown.code !== "forbidden_target") {
        throw new Error(
          `expected ${input || "(empty)"} to be a forbidden target, got ${String(thrown)}`,
        )
      }
    }
  })
})

describe("proxy token", () => {
  test("round-trips the upstream URL, headers, expiry, and platform", async () => {
    const token = await signToken({
      headers: { "X-Note": "视频", Referer: "https://www.bilibili.com" },
    })
    const claims = await verify({ token, now: issuedAt, secret })
    expect(claims.url).toBe(upstream)
    expect(claims.headers).toEqual({
      "X-Note": "视频",
      Referer: "https://www.bilibili.com",
    })
    expect(claims.expiry).toBe(expiry)
    expect(claims.platform).toBe("bilibili")
    expect(token.includes(secret)).toBe(false)
  })

  test("sets expiry five minutes after the injected issuedAt", async () => {
    const token = await signToken()
    const claims = await verify({ token, now: issuedAt, secret })
    expect(claims.expiry - issuedAt).toBe(5 * 60 * 1000)
  })

  test("accepts a token one millisecond before expiry", async () => {
    const token = await signToken()
    const claims = await verify({ token, now: expiry - 1, secret })
    expect(claims.url).toBe(upstream)
  })

  test("rejects a token at and after expiry", async () => {
    const token = await signToken()
    await expect(verify({ token, now: expiry, secret })).rejects.toMatchObject({
      name: "ProxyTokenError",
      code: "expired",
    })
    await expect(verify({ token, now: expiry + 1, secret })).rejects.toMatchObject({
      code: "expired",
    })
  })

  test("rejects a truncated token", async () => {
    const token = await signToken()
    const dot = token.indexOf(".")
    const payload = token.slice(0, dot)
    const signature = token.slice(dot + 1)
    const truncated = [payload, `${payload}.`, `.${signature}`, token.slice(0, -4), ""]
    for (const item of truncated) {
      await expect(verify({ token: item, now: issuedAt, secret })).rejects.toMatchObject({
        code: "invalid_token",
      })
    }
  })

  test("rejects a tampered payload or signature", async () => {
    const token = await signToken()
    const dot = token.indexOf(".")
    await expect(
      verify({ token: flipCharacter(token, 0), now: issuedAt, secret }),
    ).rejects.toMatchObject({ code: "invalid_token" })
    await expect(
      verify({ token: flipCharacter(token, dot + 1), now: issuedAt, secret }),
    ).rejects.toMatchObject({ code: "invalid_token" })
  })

  test("rejects a token signed with a different secret", async () => {
    const token = await signToken({ secret: "one-secret" })
    await expect(
      verify({ token, now: issuedAt, secret: "second" }),
    ).rejects.toMatchObject({ code: "invalid_token" })
  })

  test("reads the upstream URL from the token and ignores a client-supplied URL", async () => {
    const first = await signToken({ url: "https://cdn.example.com/a.mp4" })
    const second = await signToken({ url: "https://cdn.example.com/b.mp4" })
    const supplied = {
      token: first,
      now: issuedAt,
      secret,
      url: "http://169.254.169.254/latest/meta-data",
    }
    expect((await verify(supplied)).url).toBe("https://cdn.example.com/a.mp4")
    expect((await verify({ token: second, now: issuedAt, secret })).url).toBe(
      "https://cdn.example.com/b.mp4",
    )
  })

  test("round-trips an empty header set", async () => {
    const token = await signToken({ headers: {} })
    expect((await verify({ token, now: issuedAt, secret })).headers).toEqual({})
  })

  test("signs equivalent headers to the same token regardless of key order", async () => {
    const first = await signToken({ headers: { A: "1", B: "2" } })
    const second = await signToken({ headers: { B: "2", A: "1" } })
    expect(first).toBe(second)
    expect((await verify({ token: first, now: issuedAt, secret })).headers).toEqual({
      A: "1",
      B: "2",
    })
  })

  test("refuses to sign a private or non-http upstream", async () => {
    const blocked = [
      "http://10.0.0.1/a",
      "http://localhost/a",
      "http://foo.local/a",
      "ftp://cdn.example.com/a",
      "http://169.254.169.254/latest/meta-data",
      "http://[::1]/a",
      "http://192.168.1.1/a",
    ]
    for (const url of blocked) {
      await expect(signToken({ url })).rejects.toMatchObject({
        name: "ProxyTokenError",
        code: "forbidden_target",
      })
    }
  })

  test("rejects an empty secret, a bad clock, a bad platform, and an unsafe header", async () => {
    await expect(signToken({ secret: "" })).rejects.toMatchObject({
      code: "invalid_token",
    })
    await expect(signToken({ issuedAt: Number.NaN })).rejects.toMatchObject({
      code: "invalid_token",
    })
    await expect(
      signToken({ platform: "not-a-platform" as Platform }),
    ).rejects.toMatchObject({ code: "invalid_token" })
    await expect(
      signToken({ headers: { Referer: "https://cdn.example.com\r\nX: y" } }),
    ).rejects.toMatchObject({ code: "invalid_token" })
    const token = await signToken()
    await expect(verify({ token, now: 1.5, secret })).rejects.toMatchObject({
      code: "invalid_token",
    })
  })

  test("rejects a valid signature when the token URL is not public", async () => {
    const token = await signToken()
    const dot = token.indexOf(".")
    const payloadPart = token.slice(0, dot)
    const padded = payloadPart + "=".repeat((4 - (payloadPart.length % 4)) % 4)
    const binary = atob(padded.replaceAll("-", "+").replaceAll("_", "/"))
    const payloadBytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      payloadBytes[index] = binary.charCodeAt(index)
    }
    const parsed: unknown = JSON.parse(new TextDecoder().decode(payloadBytes))
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("signed payload was not an object")
    }
    const rewritten = JSON.stringify({
      ...parsed,
      url: "http://169.254.169.254/latest/meta-data",
    })
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    )
    const signature = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rewritten)),
    )
    let encodedPayload = ""
    const rewrittenBytes = new TextEncoder().encode(rewritten)
    for (const byte of rewrittenBytes) encodedPayload += String.fromCharCode(byte)
    let encodedSignature = ""
    for (const byte of signature) encodedSignature += String.fromCharCode(byte)
    const forged = `${btoa(encodedPayload).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")}.${btoa(encodedSignature).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")}`
    await expect(verify({ token: forged, now: issuedAt, secret })).rejects.toMatchObject({
      code: "forbidden_target",
    })
  })

  test("does not fetch the upstream or read the current time", async () => {
    const originalFetch = globalThis.fetch
    const originalNow = Date.now
    let fetched = false
    globalThis.fetch = new Proxy(originalFetch, {
      apply() {
        fetched = true
        throw new Error("fetch should not be called")
      },
    })
    Date.now = () => {
      throw new Error("Date.now should not be called")
    }
    try {
      assertPublicHttpUrl(upstream)
      const token = await signToken()
      const claims = await verify({ token, now: issuedAt, secret })
      expect(claims.url).toBe(upstream)
      expect(fetched).toBe(false)
    } finally {
      globalThis.fetch = originalFetch
      Date.now = originalNow
    }
  })
})
