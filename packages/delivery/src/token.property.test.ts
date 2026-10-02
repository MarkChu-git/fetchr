import { expect, test } from "bun:test"
import { platforms } from "@fetchr/core"
import * as fc from "fast-check"
import { sign, verify } from "./index"

const secretArb = fc.string({
  unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")),
  minLength: 16,
  maxLength: 32,
})
const urlArb = fc
  .domain()
  .map((host) => `https://cdn.${host}/media/file.mp4`)
const headersArb = fc.dictionary(
  fc.constantFrom("Referer", "User-Agent", "X-Note"),
  fc.string({
    unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789- .".split("")),
    maxLength: 24,
  }),
)
const platformArb = fc.constantFrom(...platforms)
const issuedAtArb = fc.integer({ min: 1_000_000_000_000, max: 2_000_000_000_000 })

test("sign and verify round-trip arbitrary public claims", async () => {
  await fc.assert(
    fc.asyncProperty(
      urlArb,
      headersArb,
      platformArb,
      secretArb,
      issuedAtArb,
      async (url, headers, platform, secret, issuedAt) => {
        const token = await sign({ url, headers, platform, issuedAt, secret })
        const claims = await verify({ token, now: issuedAt, secret })
        expect(claims.url).toBe(url)
        expect(claims.headers).toEqual(headers)
        expect(claims.platform).toBe(platform)
      },
    ),
  )
})

test("a truncated token never verifies", async () => {
  await fc.assert(
    fc.asyncProperty(
      urlArb,
      headersArb,
      platformArb,
      secretArb,
      issuedAtArb,
      fc.integer({ min: 1, max: 24 }),
      async (url, headers, platform, secret, issuedAt, cut) => {
        const token = await sign({ url, headers, platform, issuedAt, secret })
        const short = token.slice(0, Math.max(1, token.length - cut))
        await expect(verify({ token: short, now: issuedAt, secret })).rejects.toMatchObject({
          name: "ProxyTokenError",
        })
      },
    ),
  )
})

test("a token never verifies under a different secret", async () => {
  await fc.assert(
    fc.asyncProperty(
      urlArb,
      headersArb,
      platformArb,
      secretArb,
      secretArb,
      issuedAtArb,
      async (url, headers, platform, secret, other, issuedAt) => {
        fc.pre(secret !== other)
        const token = await sign({ url, headers, platform, issuedAt, secret })
        await expect(verify({ token, now: issuedAt, secret: other })).rejects.toMatchObject({
          name: "ProxyTokenError",
        })
      },
    ),
  )
})
