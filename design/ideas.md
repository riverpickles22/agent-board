---
screen: ideas
route: "#/ideas"
spec_state: matches-ui
---

# Ideas — the inbox, by conviction

The active pipeline in three columns on one row — **Idea** (rough
placeholder) → **Ready for review** (the human's thumbs-up/down moment)
→ **Ready to implement** (approved, awaiting grooming or an ad hoc
build) — with quick-win flagging from the decision lens. `done` and
`rejected` ideas live behind an **archive toggle** so finished and
declined work never crowds the active view. Clicking an idea leads to
its deep-dive page (`idea-detail.md`); this page is for scanning and
capturing.

## Layout

```
├──────────────────────────────────────────────────────────────────────┤
│ Ideas backlog                                                        │
│ Anything worth considering — features, technologies… (full width)    │
│ (Active)(Done & rejected 3)                            [+ New idea]  │
│                                                                      │
│ IDEA 10          READY FOR REVIEW 1      READY TO IMPLEMENT 0        │
│ FRONT BURNER 4   ┌────────────┐          none                        │
│ ┌────────────┐   │ Title      │                                      │
│ │ Title      │   │ descrip…   │                                      │
│ │ descrip…   │   └────────────┘                                      │
│ │ (cat) ★ quick win           │                                      │
│ │ M0 · T1 · tag               │                                      │
│ └────────────┘                                                       │
│ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄                                                       │
│ BACK BURNER 6                                                        │
│ ┌────────────┐                                                       │
│ │ Title      │                                                       │
│ └────────────┘                                                       │
├──────────────────────────────────────────────────────────────────────┤
```

The **Idea** column alone splits into two sections so the eye knows
where to spend time: **Front burner** — ideas whose `priority` sits in
the top half of the config priority vocab (default: Now, Next) — and
**Back burner** (the rest: Later, Someday), below a dashed divider.
Cards sort by priority within each section. Moving an idea between
burners is just changing its priority (Edit core); no new field.
The two burners are visibly distinct without reading the headers:
front-burner cards carry a left edge in `--accent` (echoing the accent
section header), while the whole back-burner section sits in a recessed
dashed box (`.bsec.back`) — surface mixed toward `--ground` — with its
cards quieter (dimmer surface, title in `--ink-2`). The dashed box is
the UI's "tentative" cue and replaces the bare divider line.

Archive view (toggled): same page, two columns — DONE and REJECTED —
one row.

(Column count is set per view — `repeat(3,…)` active, `repeat(2,…)`
archive — so each view is always a single row; single column under
820px.)

## Components

| Component | Anchor | Shows | Notes |
|---|---|---|---|
| Whole page | `renderIdeas()` `#view-ideas` | header + toggle + columns | with a param, delegates to `renderIdeaDetail()` |
| Header | `.vhead` | title + one-line description | full page width (`max-width:none` here — this page overrides the shared 760px cap) |
| Controls row | `.ideas-toggle` | its own row under the description: "Active" / "Done & rejected (N)" chips on the left, "+ New idea" pushed right (`margin-left:auto`) | toggle flips `ideasArchive` (in-memory, defaults to active) and re-renders; N counts archived ideas |
| New idea | `#new-idea` | "+ New idea" button | → `openIdea(null)`; visible in both views — a capture always lands in Active |
| Status column | `.ideas-col` | label + count per view's status list | active: `IDEA_STATUS` (idea → ready for review → ready to implement); archive: `IDEA_STATUS_ARCHIVE` (done, rejected). "Ready for review" is the agent's hand-off; "ready to implement" is the human's thumbs-up (AGENTS.md §2). Legacy statuses (considering/planned/building) render via `ideaStatus()` normalization |
| Burner sections | `.bsec` `.burner` | "Front burner N" / "Back burner N" sub-headers inside the Idea column only, each wrapping its cards in a `.bsec` (back: `.bsec.back`) | front = priority index < ⌈`PRIOS.length`/2⌉ (default Now/Next), accent-colored; back = the rest, dim, above a dashed divider; each section renders only when non-empty; header `title` names the priority tiers it covers; cards sorted by priority index (unknown priority sinks to back). `.bsec.back .idea` carries the quieter card treatment |
| Idea card | `ideaCard()` | title, plain description half, category pill, effort/impact / quick-win badge, `.irel` line, dependencies line | shared by every column/section; shows only `descParts().plain` — the "Technical shape:" paragraph stays on the detail page, keeping cards condensed |
| Dependencies line | `.idep` | `⊸ depends on: <ids>` in mono, dim | renders **only when `deps` is non-empty** — absent otherwise; ids may name ideas or epics; informational, no ordering enforcement (unlike epic deps) |
| Idea card | `.idea` | title, plain description half, category pill, effort/impact or quick-win badge, milestone·theme·tags line (`.irel`) | whole card clickable |
| Quick win | `quickWin()` `.qwin` | "★ quick win" when effort low + impact high | else `eiBadge()` shows "low effort · high impact" style summary (`.ei`) |
| Idea drag | `wireIdeaDrop()` `dropIdea()` | active view only: cards draggable between the three status columns; the Idea column's `.bsec` sections are finer drop targets | drop on a column → set `status` (legacy raw statuses normalize on the way); drop on a burner section → also nudge `priority` into that tier (front → lowest front tier, back → highest back tier); drop on the Idea column outside a section keeps priority. Archive view: no drag — `rejected` requires a reason, so it can't be a drop target |
| Idea modal | `openIdea()` | core fields: title, description, status ▾, priority ▾, category, milestone ▾, theme ▾, tags, depends on (ids), rejected reason | shared modal shell; deep-dive fields live on the detail page |
| Save idea | `saveIdea()` | validation (title required) | create navigates straight to the new idea's detail page |
| Delete idea | `deleteIdea()` | confirm suggesting Rejected status instead | |

## Interactions

- Idea card click → `navigate("ideas", id)` → detail page; writes nothing.
- Drag idea card → status column (active view): set `status` +
  `updated_at`, `persistResource("ideas", …)`; same-status drop writes
  nothing. Dropping into `ready to implement` is the human's thumbs-up
  made physical — agents still never make that transition themselves.
- Drag idea card → burner section: as above, plus `priority` moves into
  the section's tier when it isn't already there.
- Archive toggle click → flips the view (Active ⇄ Done & rejected),
  re-renders; writes nothing.
- "+ New idea" → modal; Create → `persistResource("ideas", …)` and jump
  to the deep dive.
- Modal save/delete → `persistResource("ideas", …)`. Saving a legacy
  status through the modal persists its normalized form.

## States

- Empty column: "none" placeholder; the whole column is still a drop
  target.
- Dragging: source card fades (`.dragging`), other cards ignore pointer,
  hovered column/section highlights (`.drop-hover`) — same language as
  the board page.
- Statuses are code-level, not config vocab — the one fixed vocabulary
  in the app (see Open questions).
- The toggle stays visible in both views so you can always flip back.

## Data

`state.ideas` grouped by `ideaStatus()` (normalizes legacy values:
considering → ready for review; planned/building → ready to implement);
`IDEA_STATUS` / `IDEA_STATUS_ARCHIVE` + `IDEA_STATUS_LABEL` order the
columns; the burner split reads `priority` against `PRIOS` (config
vocab — no idea-specific field); badges from `effort`/`impact`; `.irel`
line from `milestone`/`theme` (via `short()`) + `tags`. New ids are
`idea-<Date.now()>` (`blankIdea()`).

## Open questions

- Idea statuses are hardcoded while every other vocabulary is config —
  deliberate (the lifecycle is the tool's semantics) but worth noting as
  the exception to the nothing-hardcoded rule.
