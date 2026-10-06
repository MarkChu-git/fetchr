/**
 * budgets.json mixes hand-written fields (limits, thresholds, comments) with a baseline that
 * `bundle:check -- --write` regenerates. Only the baseline is replaced. Every other field keeps
 * its value and its position, so a baseline update shows up in the diff as new numbers only.
 */
export function applyBaseline(
  file: Readonly<Record<string, unknown>>,
  baseline: Readonly<Record<string, number>>,
): Record<string, unknown> {
  return { ...file, baseline }
}
