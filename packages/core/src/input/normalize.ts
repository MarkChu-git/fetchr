// U+200D is a joiner. These marks are stripped as individual code points so a zero-width character cannot split a pasted URL.
const invisible = new Set([0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2060, 0xfeff])

/** Share text often hides zero-width characters inside an otherwise normal URL. */
export function normalizeUserInput(input: string): string {
  let changed = false
  const kept: string[] = []
  for (const char of input) {
    const code = char.codePointAt(0)
    if (code !== undefined && invisible.has(code)) {
      changed = true
      continue
    }
    kept.push(char)
  }
  return changed ? kept.join("") : input
}
