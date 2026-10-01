// MD5 over UTF-8 input. crypto.subtle has no MD5, and the Worker allows Web
// APIs only, so the digest is computed here in plain TypeScript.

const SHIFT = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]

const K = Array.from({ length: 64 }, (_, i) =>
  Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296),
)

function rotl(value: number, bits: number): number {
  return (value << bits) | (value >>> (32 - bits))
}

export function md5Utf8(input: string): Uint8Array {
  const bytes = new TextEncoder().encode(input)
  const bitLength = bytes.length * 8
  // Append 0x80, pad to 56 mod 64, then the 64-bit little-endian bit length.
  const paddedLength = (((bytes.length + 8) >> 6) + 1) << 6
  const buffer = new Uint8Array(paddedLength)
  buffer.set(bytes)
  buffer[bytes.length] = 0x80
  const view = new DataView(buffer.buffer)
  view.setUint32(paddedLength - 8, bitLength >>> 0, true)
  view.setUint32(paddedLength - 4, Math.floor(bitLength / 4294967296), true)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  for (let offset = 0; offset < paddedLength; offset += 64) {
    const m: number[] = []
    for (let i = 0; i < 16; i += 1) {
      m.push(view.getUint32(offset + i * 4, true))
    }
    let a = a0
    let b = b0
    let c = c0
    let d = d0
    for (let i = 0; i < 64; i += 1) {
      let f: number
      let g: number
      if (i < 16) {
        f = (b & c) | (~b & d)
        g = i
      } else if (i < 32) {
        f = (d & b) | (~d & c)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        f = b ^ c ^ d
        g = (3 * i + 5) % 16
      } else {
        f = c ^ (b | ~d)
        g = (7 * i) % 16
      }
      const word = m[g] ?? 0
      const sum = (a + f + (K[i] ?? 0) + word) | 0
      a = d
      d = c
      c = b
      b = (b + rotl(sum, SHIFT[i] ?? 0)) | 0
    }
    a0 = (a0 + a) | 0
    b0 = (b0 + b) | 0
    c0 = (c0 + c) | 0
    d0 = (d0 + d) | 0
  }

  const digest = new Uint8Array(16)
  const out = new DataView(digest.buffer)
  out.setUint32(0, a0 >>> 0, true)
  out.setUint32(4, b0 >>> 0, true)
  out.setUint32(8, c0 >>> 0, true)
  out.setUint32(12, d0 >>> 0, true)
  return digest
}

export function md5Hex(input: string): string {
  return [...md5Utf8(input)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}
