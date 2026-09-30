/** Compare a hostname to a registrable name or an explicit host. Subdomains match; `nottiktok.com` does not match `tiktok.com`. */
export function hostMatches(hostname: string, domain: string): boolean {
  const host = canonicalHostname(hostname)
  const apex = canonicalHostname(domain)
  if (host.length === 0 || apex.length === 0) return false
  return host === apex || host.endsWith(`.${apex}`)
}

export function hostAllowed(hostname: string, domains: readonly string[]): boolean {
  return domains.some((domain) => hostMatches(hostname, domain))
}

function canonicalHostname(hostname: string): string {
  const trimmed = hostname.trim().toLowerCase()
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) return trimmed
  let end = trimmed.length
  while (end > 0 && trimmed[end - 1] === ".") end -= 1
  return trimmed.slice(0, end)
}
