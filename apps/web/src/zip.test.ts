import { expect, test } from "bun:test"
import { zipStore } from "./zip"

test("zipStore produces a readable zip with stored entries", async () => {
  const blob = zipStore([
    { name: "douyin-1.jpg", data: new TextEncoder().encode("first image") },
    { name: "douyin-2.png", data: new TextEncoder().encode("第二张图") },
  ])
  expect(blob.type).toBe("application/zip")
  const path = `/tmp/fetchr-zip-test-${Date.now()}.zip`
  await Bun.write(path, blob)

  const list = await Bun.$`unzip -l ${path}`.text()
  expect(list).toContain("douyin-1.jpg")
  expect(list).toContain("douyin-2.png")

  const first = await Bun.$`unzip -p ${path} douyin-1.jpg`.text()
  expect(first).toBe("first image")
  const second = await Bun.$`unzip -p ${path} douyin-2.png`.text()
  expect(second).toBe("第二张图")
})

test("zipStore handles an empty archive", async () => {
  const blob = zipStore([])
  // Just the end-of-central-directory record.
  expect(blob.size).toBe(22)
  const bytes = new Uint8Array(await blob.arrayBuffer())
  expect(bytes[0]).toBe(0x50)
  expect(bytes[1]).toBe(0x4b)
  expect(bytes[2]).toBe(0x05)
  expect(bytes[3]).toBe(0x06)
})
