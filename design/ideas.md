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
│ IDEA 10             READY FOR REVIEW 1       READY TO IMPLEMENT 0    │
│ FRONT BURNER 4      ┏━━━━━━━━━━━━━━━━━━━┓    none                    │
│ ┃━━━━━━━━━━━━━━━━┓  ┃ Title             ┃  ← purple edge = decide    │
│ ┃ Title          ┃  ┃ one-sentence out… ┃                            │
│ ┃ one-sentence…  ┃  ┃ (review)(eff·imp) ┃                            │
│ ┃ (front)(blocked)  ┃ Why now: …        ┃                            │
│ ┃ (eff·imp)(theme)  ┃ Unlocks: A · B ↑2 ┃                            │
│ ┃ Why now: …     ┃  ┃ ─────────────────  ┃                           │
│ ┃ ⊸ ✓dep  dep    ┃  ┃ Decision needed:… ┃                            │
│ ┗━━━━━━━━━━━━━━━━┛  ┗━━━━━━━━━━━━━━━━━━━┛                            │
│  ↑ blue edge = exploring                                             │
│ ┌─ BACK BURNER 6 (dashed, recessed) ─────────┐                       │
│ │ ┃ Title          ← gray edge = parked      │                       │
│ └────────────────────────────────────────────┘                       │
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
front-burner cards carry a **blue** left edge (`--st-active`) while
back-burner cards carry a **gray** one (`--st-idle`), and the whole
back-burner section sits in a recessed dashed box (`.bsec.back`) — the
UI's "tentative" cue, replacing the bare divider line.

**Colour means state, once.** Every card's left edge is set from
`ideaCardState()` alone — gray back burner, blue front burner, purple
awaiting a decision, green approved — per the legend in `system.md`.
Nothing else may tint the edge: blocked is an amber pill, conviction is
small italic text, and heavy card-wide washes are gone. This replaces
the earlier arrangement where a green "clear to pursue" wash, a blue
burner edge, and the column itself all competed to say what a card was.

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
| Burner sections | `.bsec` `.burner` | "Front burner N" / "Back burner N" sub-headers inside the Idea column only, each wrapping its cards in a `.bsec` (back: `.bsec.back`) | front = priority index < ⌈`PRIOS.length`/2⌉ (default Now/Next); back = the rest, inside the dashed recessed box; each section renders only when non-empty; header `title` names the priority tiers it covers. The burner drives each card's `data-state` (front/idle) and therefore its edge colour and status pill — the section is a grouping, the card carries the meaning. Back-burner titles dim to `--ink-2` |
| Idea card | `ideaCard()` | **five questions in five seconds** — what is it (title) · why it matters (one-sentence outcome) · how hard (pills) · what it unlocks (leverage) · what's stopping us (deps / decision) | the collapsed card carries *structured facts*, never prose: the full description, context, pros/cons and sections all stay on the deep dive. Order is fixed: title → outcome → pill row → why-now → unlocks → depends-on → milestone/theme/tags → decision |
| Outcome line | `outcomeLine()` `.iout` | the **first sentence** of the plain description half, clamped to two lines | derived, not a field — existing ideas gain it for free, and a card never shows the essay. Absent when the description is empty |
| Status pill | `ideaCardState()` `.spill` | one pill naming the workflow state in words: back burner / front burner / ready for review / ready to implement / done / rejected | the same state the left border encodes — words and colour always agree. This is the **only** thing the border may mean |
| Blocked pill | `ideaBlocked()` `.spill.blocked` | amber `blocked` pill, titled with the unresolved ids | orthogonal to status by design: a card reads "front burner" **and** "blocked" at once. Never recolours the border. Absent on archived ideas |
| Conviction | `.conv` (`CONVICTIONS`) | small italic `speculative` / `promising` / `clear to pursue` | product conviction, a different axis from workflow maturity (AGENTS.md §2) — so "ready for review · promising" is expressible. Deliberately the quietest thing in the pill row; absent when unset |
| Leverage | `unlockedBy()` `.lev` | `Unlocks: A · B · C  ↑ unlocks N` — the **inverse** of other ideas' `deps`, active ideas only | derived at render, never stored. Makes foundational work look foundational: an idea three others wait on stops reading like an isolated feature. Absent when nothing depends on it — no "unlocks 0" noise |
| Why now | `.ifact` | one line, `Why now: …` | expected on front-burner and review-ready ideas; the guard against prioritising whichever card sounds best. Absent when unset |
| Decision needed | `.ifact.decide` | the reviewer's question, last on the card above a hairline | a `ready for review` card exists to get a question answered — this puts the question where the eye lands last and stays. Absent when unset |
| Dependencies line | `.idep` `depChips(ids, soft)` | `⊸ depends on:` then one chip per id, resolved ones `✓id` in `--lane-5` | renders **only when `deps` is non-empty**; ids may name ideas (done) or epics (in the done lane), and unknown ids render dim-dotted rather than vanishing. Unresolved deps stay **dim, never loud** — idea deps are informational sequencing with no ordering rule, so they must not look like the board's dependency violations |
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
