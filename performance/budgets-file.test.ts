import { expect, test } from "bun:test"
import { applyBaseline } from "./budgets-file.ts"

// Same shape as performance/budgets.json: hand-written limits and comments around a generated baseline.
// A fresh object per call, so a test never compares the output with something the code under test changed.
function budgetsFile() {
  return {
    absolute: {
      comment: "Hard limits for apps/web/dist/client, gzip bytes. Headroom is roughly 25% over the v0.4.0 baseline.",
      totalGzipKb: 650,
      jsTotalGzipKb: 430,
      mainEntryGzipKb: 130,
      largestChunkGzipKb: 170,
    },
    relative: {
      comment: "Growth vs the baseline below. warnPct only reports; failPct blocks.",
      warnPct: 5,
      failPct: 10,
    },
    baseline: {
      totalGzipKb: 514.5,
      jsTotalGzipKb: 356,
      mainEntryGzipKb: 103.5,
      largestChunkGzipKb: 133.5,
    },
  }
}

const measured = {
  totalGzipKb: 525.25,
  jsTotalGzipKb: 366.75,
  mainEntryGzipKb: 101.5,
  largestChunkGzipKb: 134.125,
}

test("a new baseline leaves the comments of the file alone", () => {
  const next = applyBaseline(budgetsFile(), measured)

  expect(next.absolute).toEqual(budgetsFile().absolute)
  expect(next.relative).toEqual(budgetsFile().relative)
})

test("a new baseline leaves the key order of the file alone", () => {
  expect(Object.keys(applyBaseline(budgetsFile(), measured))).toEqual(["absolute", "relative", "baseline"])
})

test("a new baseline replaces the old baseline numbers", () => {
  expect(applyBaseline(budgetsFile(), measured).baseline).toEqual(measured)
})

test("a new baseline leaves top-level fields it does not know about alone", () => {
  const next = applyBaseline({ ...budgetsFile(), note: "kept" }, measured)

  expect(next.note).toBe("kept")
})
