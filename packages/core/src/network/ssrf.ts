// :: and ::1 must be checked before embedded IPv4. ::1 would otherwise look like 0.0.0.1.
function isBlockedIpv6(groups: readonly number[]): boolean {
  if (groups.length !== 8) return true
  const g0 = groups[0]
  const g1 = groups[1]
  const g2 = groups[2]
  const g3 = groups[3]
  const g4 = groups[4]
  const g5 = groups[5]
  const g6 = groups[6]
  const g7 = groups[7]
  if (
    g0 === undefined ||
    g1 === undefined ||
    g2 === undefined ||
    g3 === undefined ||
    g4 === undefined ||
    g5 === undefined ||
    g6 === undefined ||
    g7 === undefined
  ) {
    return true
  }

  if (
    g0 === 0 &&
    g1 === 0 &&
    g2 === 0 &&
    g3 === 0 &&
    g4 === 0 &&
    g5 === 0 &&
    g6 === 0 &&
    (g7 === 0 || g7 === 1)
  ) {
    return true
  }

  // fc00::/7 unique-local, fe80::/10 link-local, fec0::/10 deprecated site-local.
  if ((g0 & 0xfe00) === 0xfc00) return true
  if ((g0 & 0xffc0) === 0xfe80 || (g0 & 0xffc0) === 0xfec0) return true

  const embedded = embeddedIpv4(g0, g1, g2, g3, g4, g5, g6, g7)
  return embedded !== undefined && isBlockedIpv4(embedded)
}

function embeddedIpv4(
  g0: number,
  g1: number,
  g2: number,
  g3: number,
  g4: number,
  g5: number,
  g6: number,
  g7: number,
): readonly [number, number, number, number] | undefined {
  const mapped =
    g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff
  const compatible =
    g0 === 0 &&
    g1 === 0 &&
    g2 === 0 &&
    g3 === 0 &&
    g4 === 0 &&
    g5 === 0 &&
    (g6 !== 0 || g7 !== 0)
  if (!mapped && !compatible) return undefined
  return [g6 >> 8, g6 & 0xff, g7 >> 8, g7 & 0xff]
}

function isBlockedIpv4(octets: readonly [number, number, number, number]): boolean {
  const a = octets[0]
  const b = octets[1]
  if (a === undefined || b === undefined) return true
  // 0.0.0.0/8 is "this network" and is used to reach localhost.
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  // 169.254.0.0/16 is link-local and includes 169.254.169.254.
  if (a === 169 && b === 254) return true
  return false
}

function parseCanonicalIpv4(
  host: string,
): readonly [number, number, number, number] | undefined {
  const parts = host.split(".")
  if (parts.length !== 4) return undefined
  const numbers: number[] = []
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return undefined
    if (part.length > 1 && part.startsWith("0")) return undefined
    const value = Number(part)
    if (!Number.isInteger(value) || value > 255) return undefined
    numbers.push(value)
  }
  const a = numbers[0]
  const b = numbers[1]
  const c = numbers[2]
  const d = numbers[3]
  if (a === undefined || b === undefined || c === undefined || d === undefined) {
    return undefined
  }
  return [a, b, c, d]
}

function parseIpv6Side(side: string): number[] | undefined {
  if (side.length === 0) return []
  const parts = side.split(":")
  const groups: number[] = []
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]
    if (part === undefined || part.length === 0) return undefined
    if (part.includes(".")) {
      if (index !== parts.length - 1) return undefined
      const ipv4 = parseCanonicalIpv4(part)
      if (!ipv4) return undefined
      groups.push((ipv4[0] << 8) | ipv4[1], (ipv4[2] << 8) | ipv4[3])
      continue
    }
    if (!/^[0-9a-f]{1,4}$/.test(part)) return undefined
    groups.push(Number.parseInt(part, 16))
  }
  return groups
}

function parseIpv6(input: string): readonly number[] | undefined {
  const lower = input.toLowerCase()
  if (lower.includes(":::")) return undefined
  const halves = lower.split("::")
  if (halves.length > 2) return undefined
  const leftSide = halves[0]
  if (leftSide === undefined) return undefined
  const left = parseIpv6Side(leftSide)
  if (!left) return undefined
  if (halves.length === 1) return left.length === 8 ? left : undefined
  const rightSide = halves[1]
  if (rightSide === undefined) return undefined
  const right = parseIpv6Side(rightSide)
  if (!right || left.length + right.length > 7) return undefined
  const zeros = Array.from({ length: 8 - left.length - right.length }, () => 0)
  return [...left, ...zeros, ...right]
}

function stripTrailingDots(host: string): string {
  let end = host.length
  while (end > 0 && host[end - 1] === ".") end -= 1
  return host.slice(0, end)
}

/** True for loopback, private, link-local, and metadata names. Non-canonical IP text is rejected by the caller after WHATWG normalization. */
export function isBlockedHostname(hostname: string): boolean {
  if (hostname.includes(":")) {
    const inner =
      hostname.startsWith("[") && hostname.endsWith("]")
        ? hostname.slice(1, -1)
        : hostname
    const groups = parseIpv6(inner)
    if (!groups) return true
    return isBlockedIpv6(groups)
  }

  const name = stripTrailingDots(hostname).toLowerCase()
  if (
    name.length === 0 ||
    name === "localhost" ||
    name.endsWith(".localhost") ||
    name.endsWith(".local") ||
    name === "metadata.google.internal"
  ) {
    return true
  }
  const ipv4 = parseCanonicalIpv4(name)
  if (ipv4) return isBlockedIpv4(ipv4)
  return false
}

/** Reject non-HTTP(S), credentialed URLs, and blocked hosts before any fetch. */
export function isBlockedRequestTarget(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return true
  if (url.username.length > 0 || url.password.length > 0) return true
  return isBlockedHostname(url.hostname)
}
