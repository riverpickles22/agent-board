---
screen: history
route: "#/history"
spec_state: matches-ui
---

# History — the board's git log as a page

Every ratification (`Board:` commit touching the data dir), newest
first: date, message, files touched — and, on expand, the same
card-level change statements the pending panel shows, diffed against
that commit's parent. Git is already the event store; this page is the
lens. Read-only throughout: nothing here writes, and the page makes the
commit-=-ratify convention visible, which reinforces it.

## Layout

```
├──────────────────────────────────────────────────────────────────────┤
│ Ratification history                                                 │
│ Every save is a commit; every commit is a decision… (intro line)     │
│                                                                      │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │ 2026-08-06  Board: idea-live-reload shipped …   (ideas.json)  ▸ │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │ 2026-08-05  Board: groomed O1 into 4 stories    (epics, stories)▾│ │
│ │   O1 'Epic name' added (Backlog)                                 │ │
│ │   O1-1 'Story name' added (Backlog)                              │ │
│ └──────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────┤
```

## Components

| Component | Anchor | Shows | Notes |
|---|---|---|---|
| Whole page | `renderHistory()` `#view-history` | header + timeline entries | History tab in `#tabs` (`PAGES`), between Board and Docs |
| Entry | `.hentry` | commit date (mono), message, files-touched chips (basenames), expand toggle ▸/▾ | newest first, capped at the server's 50 |
| Entry changes | `.hchanges` `.hline` | card-level statements from `GET /api/history/<hash>` | fetched lazily on first expand, cached by hash thereafter (commits are immutable); same statement language as the pending panel |
| Empty state | `.hempty` | the server's `reason` when `available: false` (not a git repo / no commits), or "No ratifications yet…" when the list is empty | a fresh board is an answer, not an error |

## Interactions

- Tab click → `navigate("history")` → `renderHistory()`: fetch
  `GET /api/history` (fresh each visit — cheap) and render; writes
  nothing.
- Entry click (anywhere on the header row) → toggle expand; first
  expand fetches `GET /api/history/<hash>` once and caches — commits
  never change, so the cache never invalidates.
- Nothing on this page writes to the board or to git.

## States

- Loading: entry changes show a "…" line while the diff fetch is in
  flight.
- `available: false` (no git repo / no commits yet): single explanatory
  line, no error styling — the machinery assumes the git convention and
  stays quiet without it.
- Expanded entry with no statements (e.g. a commit that only reformatted
  files): "no card-level changes in this commit".

## Data

`GET /api/history` → `{available, reason?, commits:[{hash, date,
message, files}]}`; `GET /api/history/<hash>` → `{hash, statements}` —
both server-side reads of git (`server.js`: `git()`, `snapshotAt()`,
`summarizeChanges()` — the ratify panel's differ pointed at commit
pairs). No client-side git, no new board data.
