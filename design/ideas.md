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
│ (Active)(Done & rejected 3)      (⧉ copy) (↻ refresh)  [+ New idea]  │
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
Within a section (and within every other column) cards render in
**file order** — the `ideas.json` array is the queue (AGENTS.md §3),
and dragging a card between two others reorders that array. Priority
decides *which* burner a card sits in, not its order inside it. Moving
an idea between burners is just changing its priority (Edit core); no
new field.
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
| Refresh | `#refresh-ideas` | "↻ refresh" chip left of + New idea | manual trigger of the shared `refresh()` (system.md live refresh); toast reports "refreshed" vs "already up to date" — reassurance when an agent is working the ideas files |
| Copy backlog | `#copy-ideas` `ideasMarkdown()` | "⧉ copy" chip left of ↻ refresh | copies the **visible view** (active pipeline or archive) to the clipboard as markdown — headings per column/burner, one `###` per idea with its full description (both halves), a meta line (category · priority · effort · impact · milestone · theme · tags · deps · rejected reason), and the id for referencing back. Made for pasting into another LLM to brainstorm; toast confirms with the idea count |
| Status column | `.ideas-col` | label + count per view's status list | active: `IDEA_STATUS` (idea → ready for review → ready to implement); archive: `IDEA_STATUS_ARCHIVE` (done, rejected). "Ready for review" is the agent's hand-off; "ready to implement" is the human's thumbs-up (AGENTS.md §2). Legacy statuses (considering/planned/building) render via `ideaStatus()` normalization |
| Burner sections | `.bsec` `.burner` | "Front burner N" / "Back burner N" sub-headers inside the Idea column only, each wrapping its cards in a `.bsec` (back: `.bsec.back`) | front = priority index < ⌈`PRIOS.length`/2⌉ (default Now/Next), accent-colored; back = the rest, dim, above a dashed divider; each section renders only when non-empty; header `title` names the priority tiers it covers; cards sorted by priority index (unknown priority sinks to back). `.bsec.back .idea` carries the quieter card treatment |
| Idea card | `ideaCard()` | title, plain description half, category pill, effort/impact / quick-win badge, `.irel` line, dependencies line | shared by every column/section; shows only `descParts().plain` — the "Technical shape:" paragraph stays on the detail page, keeping cards condensed |
| Dependencies line | `.idep` `depChips(ids, soft)` | `⊸ depends on:` then one chip per id, resolved ones `✓id` in `--lane-5` | renders **only when `deps` is non-empty**; ids may name ideas (done) or epics (in the done lane), and unknown ids render dim-dotted rather than vanishing. Unresolved deps stay **dim, never loud** — idea deps are informational sequencing with no ordering rule, so they must not look like the board's dependency violations |
| Unblocked idea | `.idea.unblocked` `ideaUnblocked()` | green left edge + faint wash + `▶ clear to pursue` | when an **active** idea names deps and every one has landed: the sequencing precondition is met, so the idea is free to develop. Never on archived (done/rejected) ideas, and never on dep-free ideas — like the board's `.card.unblocked`, it marks the transition, not the absence of blockers. Outranks the front-burner accent edge in the cascade; back-burner ideas can show it too |
| Idea card | `.idea` | title, plain description half, category pill, effort/impact or quick-win badge, milestone·theme·tags line (`.irel`) | whole card clickable |
| Quick win | `quickWin()` `.qwin` | "★ quick win" when effort low + impact high | else `eiBadge()` shows "low effort · high impact" style summary (`.ei`) |
| Idea drag | `wireIdeaDrop()` `dropIdea()` | active view only: cards draggable between the three status columns; the Idea column's `.bsec` sections are finer drop targets | drop on a column → set `status` (legacy raw statuses normalize on the way); drop on a burner section → also nudge `priority` into that tier (front → lowest front tier, back → highest back tier); drop on the Idea column outside a section keeps priority. Archive view: no drag — `rejected` requires a reason, so it can't be a drop target |
| Reorder on drop | `insertionCard()` `.drop-before` `.drop-after` | every drop is positional: while dragging over a zone, an accent insertion line marks the gap the card will land in (above the card whose midpoint the pointer is above, or after the zone's last card) | drop inserts the card at that spot in the `state.ideas` array — same-column drops are pure reorders; cross-column drops set `status` *and* position. A drop that changes nothing (same status, same position) writes nothing |
| Idea modal | `openIdea()` | core fields: title, description, status ▾, priority ▾, category, milestone ▾, theme ▾, tags, depends on (ids), rejected reason | shared modal shell; deep-dive fields live on the detail page |
| Save idea | `saveIdea()` | validation (title required) | create navigates straight to the new idea's detail page |
| Delete idea | `deleteIdea()` | confirm suggesting Rejected status instead | |

## Interactions

- ↻ refresh click → `refresh()` (same path the SSE events drive), toast
  with the outcome: "Refreshed…" / "Already up to date." / server
  unreachable; writes nothing.
- ⧉ copy click → `ideasMarkdown()` → `navigator.clipboard.writeText`,
  toast "Copied N ideas as markdown."; writes nothing to the board.
- Idea card click → `navigate("ideas", id)` → detail page; writes nothing.
- Drag idea card → status column (active view): set `status` +
  `updated_at`, insert at the marked position,
  `persistResource("ideas", …)`; a drop that changes neither status nor
  position writes nothing. Dropping into `ready to implement` is the
  human's thumbs-up made physical — agents still never make that
  transition themselves.
- Drag idea card → burner section: as above, plus `priority` moves into
  the section's tier when it isn't already there.
- Drag idea card between two cards of its own column/section: pure
  reorder — the card moves in the `ideas.json` array (the queue), no
  other field changes except `updated_at`.
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
  the board page — and an accent insertion line (`.drop-before` /
  `.drop-after`) tracks the gap the card would land in.
- Live refresh motion: an agent moving or reordering ideas glides the
  cards to their new column/position with the lift effect; edits pulse
  `.flash` (system.md → Refresh motion).
- Dependency resolution repaints in place: finishing the idea or epic a
  card names turns that chip green, and the last one flips the whole
  card to `.unblocked` — the same language the board page uses, so one
  visual vocabulary covers both surfaces.
- Statuses are code-level, not config vocab — the one fixed vocabulary
  in the app (see Open questions).
- The toggle stays visible in both views so you can always flip back.

## Data

`state.ideas` grouped by `ideaStatus()` (normalizes legacy values:
considering → ready for review; planned/building → ready to implement);
array order **is** display order within every column and burner section
— no client-side sort re-imposes priority, so drag-reorders stick and
agents editing the file control the queue by moving entries;
`IDEA_STATUS` / `IDEA_STATUS_ARCHIVE` + `IDEA_STATUS_LABEL` order the
columns; the burner split reads `priority` against `PRIOS` (config
vocab — no idea-specific field); badges from `effort`/`impact`; `.irel`
line from `milestone`/`theme` (via `short()`) + `tags`. New ids are
`idea-<Date.now()>` (`blankIdea()`).

## Open questions

- Idea statuses are hardcoded while every other vocabulary is config —
  deliberate (the lifecycle is the tool's semantics) but worth noting as
  the exception to the nothing-hardcoded rule.
