import { describe, expect, test } from "bun:test"
import { sign } from "./signer"

const url =
  "https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=7000000000000000001"

describe("sign", () => {
  test("returns the same output for the same url and timestamp", () => {
    expect(sign(url, 1_700_000_000_000)).toBe(sign(url, 1_700_000_000_000))
  })

  test("returns a different output when the timestamp changes", () => {
    expect(sign(url, 1_700_000_000_000)).not.toBe(sign(url, 1_700_000_000_001))
  })
})
