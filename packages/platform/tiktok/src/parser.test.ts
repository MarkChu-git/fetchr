import { expect, test } from "bun:test"
import { readRehydration, rehydrationFromParts, scanRehydration } from "./parser"

const marker = "__UNIVERSAL_DATA_FOR_REHYDRATION__"

function page(script: string): string {
  return `<!DOCTYPE html><html><body>${script}<script>{"decoy":"}"}</script></body></html>`
}

const shapes = [
  `<script id="${marker}">{"a":1}</script>`,
  `<script\n  type="application/json"\n  id="${marker}"\n>\n{"a":1}\n</script >`,
  `<script data-test="x" id="${marker}">\n{\n  "nested": {\n    "value": "hello"\n  }\n}\n</script>`,
]

test("HTMLRewriter and the scanner read the same script shapes", async () => {
  for (const script of shapes) {
    const html = page(script)
    const rewritten = await readRehydration(html)
    const scanned = scanRehydration(html)
    expect(rewritten).toEqual(scanned)
    expect(rewritten.status).toBe("json")
  }
})

test("concatenates HTMLRewriter text chunks before parsing", () => {
  const extraction = rehydrationFromParts(true, ['{"a":', "1", "}"])
  expect(extraction).toEqual({ status: "json", value: { a: 1 } })
  expect(rehydrationFromParts(false, ['{"a":1}'])).toEqual({ status: "not-found" })
  expect(rehydrationFromParts(true, ["", "  "])).toEqual({ status: "empty" })
})

test("distinguishes a missing script, an empty script, and invalid JSON", async () => {
  expect(await readRehydration("<html><script>{\"a\":1}</script></html>")).toEqual({
    status: "not-found",
  })
  expect(
    await readRehydration(`<script id="${marker}">   </script>`),
  ).toEqual({ status: "empty" })
  expect(scanRehydration(`<script id="${marker}"></script>`)).toEqual({ status: "empty" })
  expect(scanRehydration(`<script id="${marker}">   </script>`)).toEqual({ status: "empty" })
  expect(await readRehydration(`<div id="${marker}">{"a":1}</div>`)).toEqual({
    status: "not-found",
  })
  expect(scanRehydration(`<script id="${marker}">{</script>`)).toEqual({
    status: "invalid-json",
  })
  expect(await readRehydration(`<script id="${marker}">{</script>`)).toEqual({
    status: "invalid-json",
  })
})

test("keeps braces, escaped quotes, and backslashes inside JSON strings", () => {
  const payload = {
    text: "a } b { c",
    nested: { ok: true },
    quote: 'say "hi"',
    path: "C:\\tmp",
  }
  const html = `<script>{"before":1}</script><script id="${marker}">${JSON.stringify(payload)}</script><script>{"after":true}</script>`
  expect(scanRehydration(html)).toEqual({ status: "json", value: payload })
})
