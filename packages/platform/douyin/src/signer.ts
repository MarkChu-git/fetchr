// Placeholder signer for fixtures only; do not ship this as production signing.
export function sign(url: string, timestamp: number): string {
  const payload = `${timestamp}\n${url}`
  let hash = 0x811c9dc5
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}
