// a_bogus signs the Douyin web client's /aweme/v1/web/* calls. The value folds
// the double MD5 of the sorted query, the request body, and the User-Agent
// with the timestamp and a fixed environment vector, then RC4s and maps the
// result through the client's alphabet. Pure TypeScript; Worker-safe.
import { md5Hex, md5Utf8 } from "./md5"

const ALPHABET =
  "Dkdpgh4ZKsQB80/Mfvw36XI1R25-WUAlEi7NLboqYTOPuzmFjJnryx9HVGcaStCe="

// A fixed desktop Chrome environment vector. It does not vary per call.
const ENVIRONMENT = [1, 0, 1, 5, 1, 1, 1, 1] as const
const CANVAS_CONST = 536919696

const MS_TOKEN_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789=_-"

function doubleMd5Array(input: string): Uint8Array {
  return md5Utf8(md5Hex(input))
}

function rc4(key: readonly number[], data: Uint8Array): Uint8Array {
  const s = Array.from({ length: 256 }, (_, i) => i)
  let j = 0
  for (let i = 0; i < 256; i += 1) {
    j = (j + (s[i] ?? 0) + (key[i % key.length] ?? 0)) % 256
    const tmp = s[i] ?? 0
    s[i] = s[j] ?? 0
    s[j] = tmp
  }
  const out = new Uint8Array(data.length)
  let i2 = 0
  let j2 = 0
  for (let k = 0; k < data.length; k += 1) {
    i2 = (i2 + 1) % 256
    j2 = (j2 + (s[i2] ?? 0)) % 256
    const tmp = s[i2] ?? 0
    s[i2] = s[j2] ?? 0
    s[j2] = tmp
    out[k] = (data[k] ?? 0) ^ (s[((s[i2] ?? 0) + (s[j2] ?? 0)) % 256] ?? 0)
  }
  return out
}

function customBase64(data: Uint8Array): string {
  let out = ""
  for (let i = 0; i < data.length; i += 3) {
    let n: number
    let pad = 0
    if (i + 2 < data.length) {
      n = ((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0)
    } else if (i + 1 < data.length) {
      n = ((data[i] ?? 0) << 16) | ((data[i + 1] ?? 0) << 8)
      pad = 1
    } else {
      n = (data[i] ?? 0) << 16
      pad = 2
    }
    const quad = [(n >> 18) & 63, (n >> 12) & 63, (n >> 6) & 63, n & 63]
    for (let k = 0; k < 4 - pad; k += 1) {
      out += ALPHABET[quad[k] ?? 0]
    }
  }
  return out
}

/** nowSeconds is injected so the signature is reproducible under test. */
export function aBogus(
  query: string,
  body: string,
  userAgent: string,
  nowSeconds: number,
): string {
  const q = doubleMd5Array(query)
  const b = doubleMd5Array(body)
  const u = doubleMd5Array(userAgent)
  const t = Math.floor(nowSeconds)

  const arr = [
    64, 0, 1, 12,
    ...ENVIRONMENT,
    q[14] ?? 0, q[15] ?? 0, b[14] ?? 0, b[15] ?? 0, u[14] ?? 0, u[15] ?? 0,
    (t >> 24) & 255, (t >> 16) & 255, (t >> 8) & 255, t & 255,
    (CANVAS_CONST >> 24) & 255, (CANVAS_CONST >> 16) & 255,
    (CANVAS_CONST >> 8) & 255, CANVAS_CONST & 255,
  ]
  let checksum = 0
  for (const value of arr) checksum ^= value
  arr.push(checksum)

  const payload = new Uint8Array([
    2, 255,
    ...rc4([255], Uint8Array.from(arr.map((value) => value & 255))),
  ])
  return customBase64(payload)
}

/** A random token the web client attaches to every signed call. rand is injectable for tests. */
export function msToken(
  length = 107,
  rand: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n)),
): string {
  return [...rand(length)]
    .map((byte) => MS_TOKEN_ALPHABET[byte % MS_TOKEN_ALPHABET.length])
    .join("")
}
