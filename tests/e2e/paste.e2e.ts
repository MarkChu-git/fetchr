import { expect, test } from "@playwright/test"

async function extract(page: import("@playwright/test").Page, url: string) {
  await page.goto("/")
  await page.getByRole("textbox").fill(url)
  await page.getByRole("button", { name: "解析" }).click()
}

test("a pasted video link resolves to a download", async ({ page }) => {
  await extract(page, "https://fixture.test/video/demo")
  await expect(page.getByRole("button", { name: "下载" }).first()).toBeVisible()
})

test("a single image post shows a download button", async ({ page }) => {
  await extract(page, "https://fixture.test/image/single")
  await expect(page.getByRole("button", { name: "下载" })).toBeVisible()
})

test("an album offers a batch download", async ({ page }) => {
  await extract(page, "https://fixture.test/image/album")
  await expect(page.getByRole("button", { name: "全部下载" })).toBeVisible()
})

test("an unknown URL reports a typed failure", async ({ page }) => {
  await extract(page, "https://example.com/not-a-post")
  await expect(page.getByRole("status").last()).not.toBeEmpty()
})
