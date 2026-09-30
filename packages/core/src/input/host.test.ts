import { expect, test } from "bun:test"
import { hostAllowed, hostMatches } from "./host"

test("matches a host and its subdomains without matching a lookalike name", () => {
  expect(hostMatches("tiktok.com", "tiktok.com")).toBe(true)
  expect(hostMatches("www.tiktok.com", "tiktok.com")).toBe(true)
  expect(hostMatches("VM.tiktok.com.", "tiktok.com")).toBe(true)
  expect(hostMatches("m.tiktok.com", "tiktok.com")).toBe(true)
  expect(hostMatches("vt.tiktok.com", "tiktok.com")).toBe(true)
  expect(hostMatches("vm.tiktok.com", "tiktok.com")).toBe(true)
  expect(hostMatches("nottiktok.com", "tiktok.com")).toBe(false)
  expect(hostMatches("tiktok.com.evil.com", "tiktok.com")).toBe(false)
  expect(hostMatches("evil.com", "tiktok.com")).toBe(false)
})

test("checks an explicit allowlist", () => {
  const allowed = ["v.kuaishou.com", "www.kuaishou.com"]
  expect(hostAllowed("v.kuaishou.com", allowed)).toBe(true)
  expect(hostAllowed("www.kuaishou.com", allowed)).toBe(true)
  expect(hostAllowed("kuaishou.com", allowed)).toBe(false)
  expect(hostAllowed("live.kuaishou.com", allowed)).toBe(false)
})
