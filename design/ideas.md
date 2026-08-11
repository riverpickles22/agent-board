---
screen: ideas
route: "#/ideas"
spec_state: matches-ui
---

# Ideas — the funnel that decides what enters execution

**Ideas answers "what might this become"; Execution answers "what are
we building".** This page is not a second Kanban — it is a funnel, and
every stage answers one of two questions: *how much do we believe in
this?* and *is it defined enough to graduate?* The lifecycle runs
**capture → back burner → front burner → review → ready → promote →
execution**, and `Promote to Execution` is the boundary where product
discovery becomes committed work.

| Stage | Means |
|---|---|
| **Back burner** | interesting and preserved, but not worth product-design time now |
| **Front burner** | worth actively shaping; questions, dependencies and approach still open |
| **Ready for review** | the concept is shaped — what remains is a deliberate decision: pursue, revise, defer, reject |
| **Ready to implement** | intent is settled enough to become executable work; awaiting promotion |

`done` and `rejected` live behind an **archive toggle**; a promoted
idea moves to `done` carrying `promoted_to`. Clicking an idea leads to
its deep-dive page (`idea-detail.md`); this page is for scanning,
capturing, and deciding.

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

**Colour is the maturity scale.** Every card's left edge comes from
`ideaCardState()` alone: **gray** dormant → **blue** being shaped →
**amber** decision required → **green** cleared (`system.md` legend).
The progression is the point, so nothing else on an idea card may carry
colour — leverage counts and dependency ticks render neutral, because a
green tick on a back-burner card makes it read "positive" and weakens
the stage signal. Red means rejected, and nothing else.

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
| Back burner fold | `.bsec.back.folded` `toggleBurnerFold()` | the back burner renders **collapsed by default** — `▸ Back burner 16` — expanding on click or Enter | it is memory, not workspace: preserved intent shouldn't occupy the column where shaping happens. The choice is remembered per browser and project (`burnerKey()`, the `modeKey()` pattern) |
| Provenance | `renderIdeaDetail()` | on a promoted idea: `Implemented by A7: <name> — 4/4 stories · shipped <date> · implementation history` | computed from `promoted_to` + the epic, never stored, so it tracks the epic as it progresses. Closes the loop the funnel opens: six months on it answers *why does this exist*, not just which commits created it |
| Burner sections | `.bsec` `.burner` | "Front burner N" / "Back burner N" sub-headers inside the Idea column only, each wrapping its cards in a `.bsec` (back: `.bsec.back`) | front = priority index < ⌈`PRIOS.length`/2⌉ (default Now/Next); back = the rest, inside the dashed recessed box; each section renders only when non-empty; header `title` names the priority tiers it covers. The burner drives each card's `data-state` (front/idle) and therefore its edge colour and status pill — the section is a grouping, the card carries the meaning. Back-burner titles dim to `--ink-2` |
| Idea card | `ideaCard()` | **the card grows as the idea matures** — the same object gets progressively more rigorous instead of being rewritten | content is a function of stage, so an early idea stays a one-line bet and a late one carries its boundary. Fields set early simply don't render until the stage earns them (a `why_now` on a back-burner card is stored, not shown). Prose always stays on the deep dive |
| — back burner | | title · outcome · effort/impact | a preserved bet, nothing more — no why-now, Opens, dependencies, theme or conviction |
| — front burner | | adds why-now · **Opens** · depends-on · theme · conviction · milestone/tags | the shaping stage: why it matters, what it unlocks, what it waits on |
| — ready for review | | same, and leads to **Decision needed** set off below a hairline | the card exists to get one question answered; it is the last thing the eye meets |
| — ready to implement | | outcome · **dependencies satisfied** · constraints · acceptance boundary · decision | the graduation packet — what promotion will carry onto the board |
| Outcome line | `outcomeLine()` `.iout` | the **first sentence** of the plain description half, clamped to two lines | derived, not a field — existing ideas gain it for free, and a card never shows the essay. Absent when the description is empty |
| Status pill | `ideaCardState()` `.spill` | one pill naming the workflow state in words: back burner / front burner / ready for review / ready to implement / done / rejected | the same state the left border encodes — words and colour always agree. This is the **only** thing the border may mean |
| Blocked pill | `ideaBlocked()` `.spill.blocked` | amber `blocked` pill, titled with the unresolved ids | orthogonal to status by design: a card reads "front burner" **and** "blocked" at once. Never recolours the border. Absent on archived ideas |
| Conviction | `.conv` (`CONVICTIONS`) | small italic `speculative` / `promising` / `clear to pursue` | product conviction, a different axis from workflow maturity (AGENTS.md §2) — so "ready for review · promising" is expressible. Deliberately the quietest thing in the pill row; absent when unset |
| Opens | `unlockedBy()` `.lev` | `Opens: A · B · C  ↑ opens N` — the **inverse** of other ideas' `deps`, active ideas only | derived at render, never stored; renders neutral so it can't compete with the stage colour. Makes architectural leverage visible: an idea three others wait on stops reading like an isolated feature. Absent when nothing depends on it — no "opens 0" noise. Front burner and beyond only |
| Promote to Execution | `promoteIdea()` `#i-promote` | "⇥ Promote to Execution" on a **ready to implement** idea's deep dive | the boundary between discovery and delivery. Creates an epic in the first lane seeded from the idea (title, description, theme, milestone, priority, tags) with a `notes` line citing the source id and carrying why-now / constraints / acceptance; sets `promoted_to`, moves the idea to `done` with a dated log entry, and jumps to the new card. Stories stay a grooming job (AGENTS.md §5) — promotion creates the epic, never a guess at acceptance criteria. **Refused without a `validation` plan**: the button explains itself before the click (an amber "needs a validation plan" beside it) and, if clicked anyway, toasts the reason and opens the core modal focused on the field — no epic is created. `validation` carries into the epic's `test_plan`. Idempotent: an already-promoted idea shows the link instead of the button. **The loop closes from the other end too**: removing the promoted epic from the board (`toggleArchiveEpic()`) walks `promoted_to` back and closes a still-open idea to `done` with a dated log line — an agent that promotes by editing JSON never runs this function, so without that cascade a finished idea sits in the funnel looking like live discovery |
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
