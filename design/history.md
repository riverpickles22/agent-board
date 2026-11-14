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
│ ┌───────────────────────────────┐  ┌───────────────────────────────┐ │
│ │ 2026-08-06  Board: idea-live… ▸│  │ 147 saves on 32 days …        │ │
│ └───────────────────────────────┘  │      Nov Dec …     Sep Oct Nov│ │
│ ┌───────────────────────────────┐  │ Mon  ▢ ▢ ▢ …      ▣ ▢ ■ ▢ ▢   │ │
│ │ 2026-08-05  Board: groomed O1 ▾│  │ Wed  ▢ ▢ ▢ …      ▢ ■ ▢ ▣ ▢   │ │
│ │   O1 'Epic name' added (Ready) │  │ Fri  ▢ ▢ ▢ …      ■ ▣ ▢ ▢     │ │
│ │   O1-1 'Story name' added      │  │ Mon, Aug 10 · 3 saves  Less…More│
│ └───────────────────────────────┘  └───────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────┤
```

The list is the left column; the calendar sits in the free space to its
right and stays in view while the list scrolls. Below 1360px there is no
room beside the list, so the calendar stacks above it.

## Components

| Component | Anchor | Shows | Notes |
|---|---|---|---|
| Whole page | `renderHistory()` `#view-history` | header + timeline entries | History tab in `#tabs` (`PAGES`), between Board and Docs |
| Page columns | `.hwrap` | list left (up to 860px), calendar right (up to 800px, sticky); one column with the calendar first below 1360px | |
| Saves calendar | `historyCalendar()` `#hcal` `.hday` | the last 53 weeks, one cell per day: weeks are columns (Sunday on top), month names above, Mon/Wed/Fri at the left; a summary line (total saves, active days) and a Less/More key | one hue in five steps — `--line-2` for no saves, then `--accent` mixed into `--panel` at 32/55/78/100% — by quartile of the days that had any save; days after today are not drawn; absent when there is no history |
| Calendar readout | `#hcal-tip` | the hovered or focused day: date · N saves | each day is a focusable button with the same text as its label |
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
- Calendar day hover or focus → its date and count in `#hcal-tip`.
  Click a day with saves → scroll to that date's first entry and mark it
  briefly (`.hmark`); if the day is older than the 50 listed entries the
  readout says so instead (`wireHistoryCalendar()`).
- The calendar's cells shrink with its column; below its minimum width
  it scrolls sideways and opens on the recent end.
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
message, files}], activity:[{date, count}]}` — `activity` is saves per
day over the last 54 weeks, days with none omitted, not capped at 50; `GET /api/history/<hash>` → `{hash, statements}` —
both server-side reads of git (`server.js`: `git()`, `snapshotAt()`,
`summarizeChanges()` — the ratify panel's differ pointed at commit
pairs). No client-side git, no new board data.
