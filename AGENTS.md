## Agent skills

### Issue tracker

Issues live in Linear team Mark's Workplace, project fetchr (P-MAR-2). See `docs/agents/issue-tracker.md`.

### Triage labels

Five default roles; each label string equals its role name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` plus `docs/adr/`. See `docs/agents/domain.md`.

## Release rules

Performance:
- Do not introduce significant performance regressions. `bun run bench` gates blocking benchmarks at >10% regression; informational benchmarks only warn.
- Run relevant benchmarks when changing hot paths (parsers, token signing, zip).
- Do not weaken budgets in `performance/budgets.json` or `bench/baseline.json` merely to make CI pass. Update baselines with `--write` only when the new cost is intended.

Compatibility:
- This repo has no OpenAPI contract and no database. `bun run compat` reports both as skipped. When a real contract or schema appears, wire the real check instead of extending the skip.
- If a database ever lands: migrations stay backwards-compatible with the previous production version; expand → migrate → contract; Worker rollback never rolls back database state.

Generated code:
- Never edit `apps/web/src/routeTree.gen.ts` by hand. Modify routes and regenerate with `bun run generate`. `bun run generate:check` runs in CI.
- Never edit the share images and icons by hand: `apps/web/public/share/*.png`, `apps/web/public/favicon-32.png`, `apps/web/public/apple-touch-icon.png`, and `apps/web/src/share-assets.gen.ts`. Change the copy in `apps/web/src/i18n.ts`, `apps/web/public/logo.svg`, or the templates in `apps/web/scripts/og`, then regenerate with `bun run generate`. The same `generate:check` covers them.

Delivery:
- Never bypass preview validation for user-facing changes.
- Never skip health gates. Never change rollout stages in `scripts/release/config.ts` just to force a release through.
- Tagged releases roll out 1% → 5% → 25% → 50% → 100% with a health gate between stages. Main pushes use the version-smoke-then-100% path in `publish-worker.ts`.
- Emergency straight-to-100%: `bun run release:promote -- --version <id> --mode default`, and say why in the PR.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Verification

After every meaningful code change, run:

`bun run verify:fast` (typecheck + type-aware lint + tests; seconds)

Before declaring a task complete, run:

`bun run verify` (verify:fast + knip + boundary scan) and `bun run policy` (Semgrep rules in `.verifier/semgrep/`; install once with `pipx install semgrep`).

If the change affects browser-visible behavior, additionally run:

`bun run test:e2e` (Playwright; fixture URLs keep it offline).

Never:

- disable a verifier to make a change pass
- weaken a rule without explanation
- add `@ts-ignore` to silence an error
- use `any` merely to bypass type checking
- remove tests to make CI pass
- add Semgrep/Knip/zizmor ignores without justification in the ignore comment

When a verifier fails:

1. Assume the code is wrong first.
2. Investigate the failure.
3. Fix the implementation.
4. Only modify verifier configuration when the verifier is demonstrably incorrect — with the reason recorded next to the change.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence
This project is indexed by GitNexus as **fetchr** (252 symbols, 261 relationships, 0 execution flows).

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx gitnexus@latest analyze` (npm 11 npx crash; #1939).

## Always Do

- **MUST run impact analysis before editing.** Use `impact({target: "symbolName", direction: "upstream"})` (MCP) or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .` (CLI fallback); report callers, processes, and risk. Never substitute grep for graph analysis.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "main"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "main" --repo .`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method before MCP/CLI impact analysis.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis, and never read `UNKNOWN` as an all-clear — it means the walk could not answer, which is the one verdict that requires confirming by other means.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit before MCP/CLI graph change analysis.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/fetchr/context` | Codebase overview, check index freshness |
| `gitnexus://repo/fetchr/clusters` | All functional areas |
| `gitnexus://repo/fetchr/processes` | All execution flows |
| `gitnexus://repo/fetchr/process/{name}` | Step-by-step execution trace |

<!-- gitnexus:end -->
