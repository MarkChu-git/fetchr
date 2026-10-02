import { sign, verify } from "@fetchr/delivery"
import { zipStore } from "@fetchr/web/zip"
import type { Bench } from "./index"

// A benchmark key never leaves the process; it just needs to clear the 16-char floor.
const secret = "bench-".repeat(4)
const payload = {
  url: "https://cdn.example/media/clip.mp4",
  headers: { Referer: "https://www.douyin.com/" },
  platform: "douyin" as const,
  issuedAt: 1_800_000_000_000,
  secret,
}
const megabyte = new Uint8Array(1024 * 1024).map((_, i) => i % 251)

export const benches: Bench[] = [
  {
    name: "proxy token sign+verify",
    blocking: true,
    run: async () => {
      const token = await sign(payload)
      await verify({ token, now: 1_800_000_100_000, secret })
    },
  },
  {
    name: "zipStore: 2MB across two entries",
    blocking: false,
    run: () => {
      zipStore([
        { name: "a.jpg", data: megabyte },
        { name: "b.jpg", data: megabyte },
      ])
    },
  },
]
