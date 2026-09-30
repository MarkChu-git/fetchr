# Issue tracker: Linear

Issues and specs for this repo live in Linear.

- Team: Mark's Workplace
- Project: fetchr (P-MAR-2)
- Identifier prefix: MAR (for example MAR-50)
- Tool: Linear MCP (`save_issue`, `get_issue`, `list_issues`, `save_comment`, `list_comments`). Do not use `gh` for issues.

## Conventions

- **Create an issue**: `save_issue` with `team` "Mark's Workplace", `project` "fetchr", `title`, and `description` as Markdown. New issues start in Backlog.
- **Read an issue**: `get_issue` on the MAR identifier. Pass `includeRelations: true` when blocking matters, then `list_comments` with `issueId`.
- **List issues**: `list_issues` with `team` "Mark's Workplace" and `project` "fetchr". Add `label` and `state` when a skill asks.
- **Comment**: `save_comment` with `issueId` and `body`.
- **Apply / remove labels**: `save_issue` with `id` plus `addLabels` or `removeLabels`. The five triage labels exist on Mark's Workplace.
- **Close**: `save_issue` with `state` "Done". A wontfix close uses `state` "Canceled". A duplicate uses `state` "Duplicate".

Team states: Backlog, Todo, In Progress, In Review, Done, Canceled, Duplicate.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## When a skill says "publish to the issue tracker"

Create a Linear issue in team Mark's Workplace, project fetchr.

## When a skill says "fetch the relevant ticket"

`get_issue` on the MAR identifier, plus `list_comments`.

## Wayfinding operations

Used by `/wayfinder`. The map is a parent issue. Child issues are tickets.

- **Map**: one issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. Create it in project fetchr.
- **Child ticket**: `save_issue` with `parentId` set to the map identifier. Labels: `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`. Put `Part of MAR-<map>` at the top of the child body.
- **Blocking**: set `blockedBy` on the child to the blocker identifiers. A ticket is unblocked when every blocker is Done or Canceled.
- **Frontier query**: `list_issues` with `parentId` of the map, drop Done and Canceled, then drop any issue with an open blocker or an assignee. First in map order wins.
- **Claim**: `save_issue` with `assignee` "me". That is the session's first write.
- **Resolve**: `save_comment` with the answer, then `save_issue` with `state` "Done", then append a context pointer to the map's Decisions-so-far.
