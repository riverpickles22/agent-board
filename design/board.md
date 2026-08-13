---
screen: execution
route: "#/board"
aliases: ["#/execution"]
spec_state: matches-ui
---

# Board — kanban over epics, with a story-rows mode

Drag-and-drop kanban of epics across the configured lanes, filterable by
milestone / theme / tag, with a dependency guard on every move and a
**Next up** strip that renders the selection rule (PROTOCOL §3) the
agent uses — human and agent see the same answer to "what's next".
Cards open an edit modal that also holds the epic's stories.
A **View toggle (Epics | Rows)** switches the same board area to story
swimlanes: one row per epic, the epic's stories as compact cards in the
lane columns.

**On the name.** This page was briefly renamed *Execution*, to stop
"the board" from meaning both this and the ideas funnel, then renamed
back — the collision is real but "Board" is what people call it. Both
spellings resolve forever: `PAGE_ALIASES`/`resolvePage()` map
`#/execution` and `view.default_page: "execution"` onto `board`, and
`route()` rewrites an aliased hash to the canonical one with
`replaceState`. The alias is permanent, not a migration window — a URL
that worked once should keep working, and the configs live in other
people's repos. When disambiguation matters in prose, say *the execution
board* and *the ideas funnel*.

## Layout

Epics mode (the default):

```
├──────────────────────────────────────────────────────────────────────┤
│ View(Epics)(Rows) (Current)(Shipped 6) Milestone▾ Theme▾ (More…)    │  filters
│ ┌──────────────────────────────────────────────────────────────────┐│
│ │ Ready to pick up  3 · 1 in flight    deps satisfied · criteria …  ││  work
│ │ F1-1  Story name…                    Claude Code · 3m ago         ││  queue
│ │ F1-2  Story name…                    F1 · feature · 4 criteria    ││
│ └──────────────────────────────────────────────────────────────────┘│
├──────────────────┬──────────────────┬────────────────────────────────┤
│ ▍{lane 1}     5  │ ▍{lane …}  3/2  │ ▍{last lane}                 4  │
│ [+ add card]     │ [+ add card]     │ [+ add card]                   │
│ ┌──────────────┐ │                  │ ┌──────────────┐               │
│ │ F1     (Now) │ │                  │ │ F3    (Next) │               │
│ │ Epic name…   │ │                  │ │ …            │               │
│ │ (M0)(T1)(tag)│ │                  │ └──────────────┘               │
│ │ (sys) status │ │                  │                                │
│ │ 3 stories·1 ready  ⊸ ✓F2 F4  ⛔{gate}  claimed: session           │
│ ├──────────────┤ │                  │  (green edge + ▶ ready to start│
│ │▍F7 all deps ✓│ │                  │   when the last dep lands)     │
│ └──────────────┘ │                  │                                │
├──────────────────┴──────────────────┴────────────────────────────────┤
```

Rows mode (same filters + next-up above; the board area becomes swimlanes,
vertically scrolling, lane strip sticky):

```
├──────────────────────────────────────────────────────────────────────┤
│ ▍{lane 1}    3 │ ▍{lane …}    1 │ ▍{last lane}                   2  │  sticky
├──────────────────────────────────────────────────────────────────────┤
│ F1  Epic name…                            ⛔ {gate}   2/4 {last lane}│  row hdr
│ ┌─────────────┐┌────────────┐ │              │ ┌─────────────┐       │
│ │[kind] F1-1  ││[kind] F1-2 │ │              │ │[kind] F1-4  │       │
│ │ Story name… ││ …  ✓ ready │ │              │ │ …           │       │
│ └─────────────┘└────────────┘ │              │ └─────────────┘       │
├──────────────────────────────────────────────────────────────────────┤
│ F3  Epic name…              ▬▬▬▭▭  2/5 done · 1 ready · 1 needs you │  row hdr
│ ┌─────────────┐               │              │ ✓ 2 done · view       │
│ └─────────────┘               │              │                       │
├──────────────────────────────────────────────────────────────────────┤
│ F9  Finished epic…                     ✓ 4/4  [⌂ Remove from board] │  folded
├──────────────────────────────────────────────────────────────────────┤
│ 2 epics without stories — shown in Epics mode                        │  note
```

Card modal (over everything, via the shared shell in `system.md`) — the
story in a review lane, where the criteria lead:

```
┌──────────────────────────────────────────────────────────────┐
│ F1-1  ⚑ ready to check                    epic F1 · Review   │ sticky
│ Story name (edits in place)                                  │
│ This lane asks: What should a reviewer check?                │
├───────────────────────────────────┬──────────────────────────┤
│ CHECK THESE · 5           (edit)  │ BUILT BY                 │
│  • criterion, wrapping cleanly…   │ agent-3 · 2h ago         │
│  • criterion…                     │ KIND ▾      PRIORITY ▾   │
│                                   │ LANE ▾                   │
│ DESCRIPTION                       │ [✓] ready — enough …     │
│ ┌───────────────────────────────┐ │ EPIC                     │
│ │ grows to its content, never   │ │ F1 Epic name             │
│ │ scrolls inside the modal      │ │ 2/6 stories done         │
│ └───────────────────────────────┘ │ SYSTEMS INVOLVED         │
│ CONTEXT FOR THE BUILDER           │ [arc-core            ]   │
│ ┌───────────────────────────────┐ │ UPDATED                  │
│ └───────────────────────────────┘ │ 2026-08-11               │
├───────────────────────────────────┴──────────────────────────┤
│ [Save] [Back to epic]                            [Delete]    │ pinned
└──────────────────────────────────────────────────────────────┘
```

In the **first lane** the same modal leads with the description, and the
rail opens with *"Before an agent can pick this up"* instead of the claim:

```
│ BEFORE AN AGENT CAN PICK THIS UP                             │
│ needs prep — the ready flag is a human's call                │
│ ⛔ epic gated: design-review                                  │
│ ⏳ epic waiting on F4                                         │
```

The **epic modal** is the same shell: description, notes, the stories
list and context docs in the left column; ID, lane, priority, milestone,
theme, status, tags, systems, deps, gate and claim in the rail.

## Components

| Component | Anchor | Shows | Notes |
|---|---|---|---|
| View toggle | `.chip.mode` | Epics \| Rows, current mode `aria-pressed` | first chips in `#filters`; switches the board area's rendering mode and remembers the choice per browser (`rememberBoardMode()`) |
| Shipped toggle | `.chip[data-arch]` | (Current)(Shipped N) chips after the view toggle — the Ideas page's archive pattern applied to epics | flips `boardArchive` (in-memory, defaults to current); the Shipped chip renders only when archived epics exist (or while viewing them). Shipped view shows `archived_at` epics in both modes, read-only: cards not draggable, next-up + ready strips hidden, counts read "N shipped". Milestone/theme/tag filters apply within each view |
| Filter header | `renderFilters()` `#filters` | **one row**: view toggle · Current/Shipped · `Milestone ▾` · `Theme ▾` · `More filters` | the board prioritises execution over taxonomy, so vocabulary collapses to selects (`.fsel`) and the rest hides behind the disclosure (`moreFilters`, `.frow2`): tag chips and ★ set-as-default. A dot on the button marks an active tag filter. Chip rows returned one row per vocab entry — three rows before you reached the work |
| Work queue | `renderWorkQueue()` `#workq` `queue.js` | **one strip, one answer.** Header reports the single most actionable state: `Ready to pick up · N` (with `· N in flight` when work is also running), `Agent working · N` when everything ready is claimed, or `Nothing ready` naming why. Body lists in-flight stories first — each with **who claimed it and how long ago** (`inFlight()`, `sinceLabel()`) — then pickable ones with why they qualified | the pickable/in-flight/next-up **rules live in `queue.js`**, shared verbatim with `./board next` and `./board status` (the doctor's pattern), so the strip and the CLI cannot disagree; the render code only re-shapes the module's result. Replaces the old separate Next-up and Ready strips, which answered the same question at different grains and could print "nothing pickable" directly above three ready stories. Story grain is primary because stories are what agents claim; `nextUp()`'s epic grain survives as the fallback for a board with epics but no stories yet. Board-wide — ignores the filters |
 story-grain PROTOCOL §3: `ready: true` + story in the first lane + unclaimed + epic gate open + epic deps done; ranked story priority → epic rank (file order) → story file order, epic groups ordered by their best story. Board-wide like Next up (ignores filters). No stories on the board → strip absent; stories exist but none pickable → one-line reason in Next up's empty language. Click → the story modal |
| Column | `render()` `.col` | swatch + lane name + shown count — or, when the lane has a `wip_limits` entry, `total/limit` (`.ct.wlim`) | top border + header tint from `--lc` = `laneVar(col)`, which is **positional and semantic**: first lane gray (`--st-idle`), last green (`--st-ready`), the one before it amber (`--st-blocked`) once a board has four or more lanes — the review position, `reviewLane()`, which is null on a board of three lanes or fewer — and everything between accent. Never keyed to lane *names*, so each project's vocabulary works unchanged. `reviewLane()` is the single definition of that position: `storyState()` reads the same helper, so the lane's colour and its cards' copy can never disagree about which lane is review. The WIP count is **board-wide** (total epics in the lane — the number PROTOCOL §3's `wipBlocked()` compares), not the filtered count; over limit → `.over` in `--lane-4` with an explanatory title. Advise-only: limits never block a drop — that stays the agent protocol's job |
| Claim age | `claimIsStale()` `claimLabel()` `claimTitle()` `.claim.stale` | every claim shows its holder **and how long it has been held**; past 48h on a card outside the done lane it turns amber with `⚠` and explains itself | a claim is *suspect*, never wrong — a long-running job and an abandoned one are indistinguishable from outside, so nothing is ever auto-cleared. One rule feeds cards, story states and the briefing's stale count. On stories the stale reading **outranks the lane's activity verb** in every lane: "cooking" for three days is not cooking, and "in review · alice" for three days is not a review in progress |
| Release claim | `releaseClaim()` `#m-release` `#s-release` `.rq-rel` | "↩ Release claim" in the epic and story modals, and a `↩` on each in-flight row of the work queue | clears `claimed_by`/`claimed_at` in one write and re-renders; lane and readiness are untouched. PROTOCOL §3 treats "already claimed" as unpickable, so a dead claim silently shrinks the queue — this is how it is given back. When nothing is pickable because of claims, the queue's reason says how many are stale |
| Needs-you state | `needsBit()` `needsLine()` `.needs-you` | amber `⚠ needs decision` (or the record's own `kind`) with the **reason on the card**, plus an amber left edge — on stories and epics alike | the one state asking for a *person*, so it outranks every other in `storyState()`. Deliberately distinct from a dependency: a dependency clears when other work lands, this clears only when you answer. Set from the `needs` field (AGENTS.md §2), accepts `{kind, reason}` or a bare string; never shown on done cards |
| Needs grooming | `needsGrooming()` | amber `⚠ needs grooming` on a first-lane epic with **no stories** | the promotion gap made visible: an idea promoted from the funnel arrives committed but not broken down, and would otherwise sit in the first lane looking ready |
| Epic roll-up | `epicRollup()` `.eroll` | progress bar + `N/M done · N ready · N needs you` in every swimlane header | ready and needs-you counts come from the same rules the strips use, so the row header and the queue can never disagree |
| Done collapse | `.donefold` `expandedDone` | the done lane inside an active row collapses to `✓ N done · view` | completed work demands the least attention; the remaining stories should own the row. Expanding is per-row and view-only |
| Finished row fold | `.swim.done-fold` `expandedRows` `canRemove()` | a fully-done **unarchived** epic collapses to one line: `id · name · ✓ 4/4` with an inline **⌂ Remove from board** | **the stories are the truth**: the fold reads `canRemove()` — every story in the done lane — and no longer also demands the epic's own card be there. Requiring both left rows sitting open at `3/3` because nobody had dragged the epic across, which is bookkeeping the row already knew. Archive previously lived only in the epic modal, unreachable from rows mode — the affordance comes to the row rather than duplicating the feature. Clicking the row expands it; clicking the button runs `toggleArchiveEpic()` |
| Add card | `.addcard` | "+ add card" atop each lane body | → `openCreate(col)` with the lane preset |
| Card | `cardEl()` `.card` | id, priority pill, name, milestone/theme/tags/systems pills, status, story badge, dep badge, gate chip, claim | draggable, tabIndex 0 |
| Card hover | `.card:hover` `.scard:hover` | the card takes **its lane's colour** whole — same hue on every edge over a faint wash — using the `--lc` that already rides the column and the swimlane cell | at rest a card is neutral with the lane's colour carried by the column header, so a lane scans as a lane. Hover is the only moment one card should outrank its neighbours, so it is the only moment the colour spreads. The wash stays under 10% so prose keeps its contrast in both themes. `.card.unblocked` keeps its green left edge through the hover — "startable now" is a different fact from the lane, and the lane's colour must not eat it |
| Gate chip | `.card .egate` | `⛔ {gate}` when the epic's gate is closed (`gate ≠ "none"` and not in `open_gates`) | same markup, title, and `--lane-2` color as the rows-mode row-header badge — one gate vocabulary across modes. Absent when the gate is `"none"` or open. Advises only: the chip explains why agents won't pick the card; drag behavior is unchanged (`checkMove` never reads gates) |
| Story badge | `.stbadge` | "N stories · M ready" | ready count in `--lane-5`; M counts ready stories **not yet in the done lane** — a shipped story is done, not "ready" (finished ≠ pending, the ready-queue's rule). Segment absent when M = 0; N still counts all stories |
| Dep badge | `depChips()` `.dep` `.depid` | `⊸` then **one chip per dependency**, each colored by its own state: `✓F2` in `--lane-5` when that dep sits in the done lane, `F4` in `--lane-4` (bold) when it doesn't; a dep id naming nothing renders dim with a "not found" title | per-dep, not lumped — you can see *which* of four deps cleared. Each chip's `title` names the dep and where it currently sits. Unknown ids are shown, never silently dropped |
| Unblocked card | `.card.unblocked` | green left edge + faint `--lane-5` wash + a `▶ ready to start` marker (`.rdytag`) | renders only when the card **has** deps, **all** are satisfied, and nothing else stops a start: first lane, gate open, unclaimed. A gated / claimed / already-moved card with satisfied deps gets nothing — it isn't startable, and the board never says "ready" about work you can't take. Dep-free cards are untouched: the signal marks a *transition* (the last dep landed), not merely an empty queue. Same left-edge idiom as the ideas page's front burner |
| Claim | `.claim` | "claimed: {claimed_by}" | accent, only when claimed |
| Move guard | `checkMove()` | — | can't enter done lane with unmet deps; can't leave it while a done dependent points here |
| Drop wiring | `wireDrop()` | drop-hover highlight; refused drop → toast with reason | `.no-drop` columns dim during drag (`body.is-dragging`) |
| Rows: lane strip | `renderSwimlanes()` `.rows-head` | swatch + lane name + story count per lane | sticky atop the scrolling board; same positional `--lc` colors as columns |
| Rows: swimlane | `swimEl()` `.swim` `.swim.unblocked` | one row per shown epic with ≥1 story | row order = epic array order (queue order); an unblocked epic (same rule as `.card.unblocked`) carries the green left edge so the cue reads identically in both modes |
| Rows: row header | `.swim-h` | epic id, name, gate badge (`.egate`, when gate closed), done-count "d/N {last lane}" | click → `openEdit(id)` |
| Rows: cell | `.swim .cell` | the epic's stories in that lane | one per lane per row; drop target via `wireStoryDrop()` |
| Rows: story card | `storyCardEl()` `.scard` | kind chip, mono id, **state chip** (`.sstate`), name | draggable within its row; click opens the story modal |
| Story state chip | `storyState()` `.sstate` | one chip from one rule — lane + `ready` + claim + epic health (the ready-queue rule, extended to display). In priority order: done + unfinished siblings → `✓ done · waiting on <sibling>` (+N); done, epic complete → pooled `✓ shipped` / `✓ plated` / `✓ in the books` (stable per story via id hash — variety without randomness); `reviewLane()` → the work is built and waiting on a look, so the register changes: `⚑ ready to check` (feature, chore) · `⚑ results in` (test) · `⚑ ready to read` (docs) · `⚑ wired — verify` (integration), or `⚑ in review · <who> · <since>` when claimed — a claim here names the *reviewer*, which outranks what is being reviewed; any other middle lane → activity by `kind`: feature `cooking` · test `testing` · chore `tidying up` · docs `writing` · integration `wiring up` (tooltip: real lane + claim); first lane + ready → `✓ ready` when pickable, `⛔ gated: <gate>` / `⏳ waiting on <dep>` when the epic is blocked, `claimed` when claimed; first lane, not ready → dim `needs prep` | color: green ok / amber blocked / amber-review / accent active / dim quiet (`--lane-5`/`--lane-2`/`--st-decide`/accent/`--ink-3`). Review gets its own class (`.rev`) rather than borrowing `.warn`: it sits under the same amber lane header, but nothing is wrong — the chip is a hand-off, not an alarm, and `⚠ needs decision` / `⚠ stale claim` must still outrank it. The same chip renders read-only in the epic modal's story rows beside the lane text — the ready checkbox stays the editor. `✓ ready` never appears outside the first lane |
| Rows: note | `.rows-note` | "N epics without stories — shown in Epics mode" / rows-empty guidance | renders only when it has something to say |
| Card modal | `.modal.wide` `modalHead()` `.mgrid`/`.mcol`/`.mrail` `autoGrow()` | both the epic and story modals: a sticky header (id · state chip · where it sits · the lane's question) over a two-column body — **prose left, decisions right** — with a pinned action bar | the old 560px single column made every field the same width, so `Systems involved` got a full-width input while the acceptance criteria — the reason you opened the card — scrolled inside a 70px box. Content now takes the wide column and **sizes to itself** (`autoGrow()`: no scrollbar inside a scrollbar), while everything that is a one-word decision (kind, lane, priority, milestone, theme, gate, claim) moves to the rail. The name renders as the title and edits in place. The Ideas modal keeps the narrow form — it edits an idea's core fields, not a work card |
| Lane focus | `laneFocus()` `.mh-ask` | the modal leads with what **this lane** asks: first lane *"Can an agent start this?"*, middle *"Who has this, and how far along?"*, `reviewLane()` *"What should a reviewer check?"*, done *"What shipped?"* | a card is a different question in each lane, so opening it should surface a different thing. In review and done the criteria lead the column and change their heading (*Check these* / *What this delivered*) — they are the checklist and the record; elsewhere the description leads. The rail reorders to match: queued shows **what stops a start** first, in flight and review show the claim first (*Built by* in review), done shows the epic and which siblings still block the ship. Positional like every other lane rule, so a project's own lane names work unchanged. **Nothing is ever hidden, only ordered** — every field stays editable from every lane |
| Test plan | `#f-testplan` | the epic's `test_plan` — *how this change gets validated* — a full-width block under Notes | arrives filled on a promoted epic (carried from the idea's `validation`, which promotion requires) and is editable after. Deliberately **prose in the left column, not a rail field**: it is read while grooming and while verifying, not a one-word decision. Distinct from a story's `acceptance_criteria` — the criteria say what must be true, the plan says what you run to find out |
| Epic modal | `renderModal()` | all epic fields per AGENTS.md §2, in the card-modal shell: description, notes, test plan, stories and context docs left; ids, vocabularies, gate, deps and claim in the rail | `context_docs` renders read-only (below) — still no edit widget; lane change re-runs `checkMove`. `claimFact()` states the claim in words above the input, including `⚠ stale` |
| Context docs chips | `.field .ctxdocs` (modal) | the epic's `context_docs` as read-only label+path+note chips, reusing the Milestones `ctxDocs()` renderer; click copies the doc's path (toast confirms) | edit mode only, and only when the epic has docs — no section otherwise, and the create modal never shows it. Copy-on-click follows the Ideas-page copy convention; **no input exists** — `context_docs` stays file/skill-edited (AGENTS.md §2) |
| Stories section | `storiesSection()` `wireStoriesSection()` | story rows + ready checkboxes inside the epic modal | edit mode only, not on create |
| Story modal | `renderStoryModal()` | the card modal for a story: description, criteria and builder context left; kind/priority/lane/ready, claim, epic and systems in the rail | "Back to epic" returns to `openEdit(epicId)`. The header carries the story's own `stateChip()`, so the computed state (`⚑ ready to check`, `⚠ stale claim`) is visible where you edit it. The Epic block names its parent, its done-count, and any gate or unmet dependency **inherited** from it — a story is blocked by its epic far more often than by itself |
| Criteria list | `.aclist` `#s-ac-field` `#s-ac-edit` | acceptance criteria render as a **bulleted list**, with an `edit` link that swaps in the raw one-per-line textarea | a textarea cannot show where one criterion ends and the next begins once they wrap, and wrapping is the normal case — five long criteria read as one paragraph. The list is the default reading; editing is one click. `saveModal`'s story path reads the textarea **only if it exists**, so saving a card whose criteria were never opened preserves them exactly |
| Start blockers | the rail's *"Before an agent can pick this up"* block | on a first-lane story: every reason it is not pickable — `needs prep`, no criteria, already claimed, epic gated, epic waiting on deps — or `✓ nothing is in the way` | the ready-queue rule (PROTOCOL §3) spelled out on the card it governs, instead of leaving the human to infer it from the queue's absence. Same inputs as `storyState()` and the work queue, so the three cannot disagree |
| Save epic | `saveModal()` | validation → create/update | duplicate-id and empty-name errors in `.m-err` |
| Remove from board | `toggleArchiveEpic()` `canRemove()` `removeTitle()` `#m-arch` `.rowarch` | "⌂ Remove from board" in the edit modal **and** on the folded row — shown when `canRemove(e)` and it isn't archived yet. `canRemove()`: every story in the done lane, or, for a story-less epic, its own card there | one action closes the whole thread. It stamps `archived_at` (AGENTS.md §2), and first **moves the epic card to the done lane** if it lags — the stories being done makes the card's lane a formality, so the button finishes it rather than making the human drag it. That move still passes `checkMove()`: an unmet dependency refuses the whole removal with the drag's own toast, and nothing is written. It then **closes the idea behind the epic** (`ideaBehind()` — `promoted_to` points here) to `done` with a dated log line, because an idea promoted by an agent editing JSON never runs `promoteIdea()` and otherwise sits in the funnel forever looking like open discovery. Epics and ideas persist separately (`persist()` + `persistResource("ideas", …)`), and `removeTitle()` states every one of these consequences in the button's tooltip before the click. In the Shipped view the button reads "Unarchive" and clears the stamp; the idea stays `done` — it became work, and that doesn't un-happen. Archived epics still feed milestone roll-ups and dependency checks — archiving hides, never deletes |
| Delete epic | `deleteEpic()` | confirm listing dependents + story cascade | deletes epic + its stories |

## Interactions

- Drag card → lane: `checkMove()`; legal → set `column` + `updated_at`,
  `persist()` (= `persistResource("epics", …)`); refused → `showToast(reason)`,
  nothing written.
- View toggle click → set `boardMode`, remember it in `localStorage`
  (per-browser, keyed by project title — `rememberBoardMode()`),
  re-render the board area; writes no board data. ★ set as default view
  persists the shared default as `config.view.default_board_mode` via
  `persistResource("config", …)`.
- (Rows) drag story card → cell in its own row: set story `column` +
  `updated_at`, `persistResource("stories", …)`. Cross-row drop or a
  gated epic's cell → `showToast(reason)`, nothing written. No
  dependency guard — stories have no deps; only the epic's gate
  constrains them.
- (Rows) click row header → `openEdit(epicId)`; click story card → the
  story modal (`renderStoryModal(epicId, sid)`); writes nothing.
- Next-up chip click → `goToEpic(id)` (filter to its milestone, scroll +
  flash the card); writes nothing. The strip re-renders with every
  `render()`, so it always reflects current lanes/claims.
- Ready-queue chip click → `renderStoryModal(epicId, sid)` — straight to
  the story a "begin X" would target; writes nothing. Re-renders with
  every `render()` like Next up.
- Click card / Enter on focused card → `openEdit(id)`; writes nothing.
- Click a context-docs chip in the modal →
  `navigator.clipboard.writeText(path)` + toast; writes nothing to the
  board — the chip is a launchpad (paste into an editor or another
  Claude session), not an editor.
- Filter chip click → update `filterMS`/`filterTheme`/`filterTag`,
  re-render; writes nothing.
- ★ set as default view → writes `config.view` via
  `persistResource("config", …)`, toast confirms.
- Ready checkbox on a story row → toggles `ready` + `updated_at`,
  `persistResource("stories", …)`.
- Epic save → `persistResource("epics", …)`; story save/delete →
  `persistResource("stories", …)`; epic delete may write both.
- Story/epic delete → `window.confirm` first ("recoverable via git").

## States

- Empty board: lanes render with count 0 and "+ add card" only; the
  Next-up strip hides entirely (no epics = nothing to say).
- Epics exist but none pickable (and no stories yet): the queue shows "Nothing ready" with
  the reason breakdown (N blocked by deps · N gated closed · N claimed),
  the WIP-limit case, or "the {first lane} lane is empty" — an empty
  selection is an answer (PROTOCOL §3).
- Filtered: counts flip to "X of N shown" (see `system.md` counts). A
  limited lane's header keeps showing board-wide `total/limit` even
  while filtered — the limit is a board property, not a view property.
- Over WIP limit: the `total/limit` count turns loud (`--lane-4`, bold)
  with a title naming the limit — visible feedback while agents move
  cards through lanes in real time; nothing is prevented.
- Gated: closed-gate cards wear the `⛔` chip in both modes; opening the
  gate in `config.json` clears it on the live-reloaded page. Humans open
  gates; the UI only reports them.
- Dragging: source card fades (`.dragging`), other cards ignore pointer,
  illegal lanes dim (`.no-drop`), hovered legal lane highlights
  (`.drop-hover`).
- Live refresh motion: an agent's move glides the card (epics mode and
  rows-mode story cards alike) to its new lane with the lift effect;
  edits pulse `.flash` (system.md → Refresh motion).
- Jump-in from milestones (`goToEpic()`): switches to Epics mode first
  (the `.card[data-id]` target only exists there) without overwriting
  the remembered toggle choice, filters set to the epic's milestone,
  card scrolled into view with a 1.3s `.flash` ring. Follows the target
  into the right view — jumping to an archived epic lands in Shipped.
- Shipped view: the museum, not the workshop — read-only cards, no
  strips, no WIP counts (`total/limit` is a property of live work).
  `epicShown()` gates on `archived_at` first, so every reader of the
  shown set (render, counts) agrees on the view.
- Unknown card column (stale data): normalized to first lane on load —
  stories too.
- Rows mode, epics without stories: skipped, counted in `.rows-note`.
  Rows mode with no story-bearing epics at all: the note explains and
  points back to Epics mode. Counts in the header flip to story counts.
- Rows mode dragging: same `.drop-hover` / `.no-drop` language as
  columns — other rows' cells and gated rows dim.
- Dependency states repaint themselves: a dep card reaching the done
  lane turns its chip green everywhere it appears, and the card whose
  last dep just landed flips to `.unblocked` — arriving over live
  refresh, so the transition animates rather than appears. The epic's
  stories change in step (`storyState()` drops `⏳ waiting on X` for
  `✓ ready`), because both read the same epic health.
- Story states are display-only vocabulary: `storyState()` never writes
  and every surface (rows chip, modal chip, epic badge, ready queue)
  derives from the same inputs — no surface may read `ready` without
  also reading the lane.

## Data

The Next-up strip was the first UI reader of `config.open_gates` and
`config.wip_limits` (previously protocol-only); lane headers now read
`wip_limits` too (B1-1), rendering the same board-wide numbers
`wipBlocked()` compares.
`state.epics` filtered by `epicShown()` (milestone AND theme AND tag);
stories via `storiesOf(epicId)`; vocab from `COLUMNS`/`PRIOS`/`THEMES`/
`MILESTONES`; lane color by position (`laneVar`), priority pill class by
index (`prioClass`). New-epic ids suggested as `NEW1…` (`suggestId()`),
story ids `<epic_id>-<n>` (`suggestStoryId()`).
`boardMode` ("epics" | "rows") defaults from the last toggle click
remembered in this browser (`savedBoardMode()`, `localStorage` keyed by
project title), else `config.view.default_board_mode`, else "epics"
(`viewDefaults()`).
Rows mode shows stories only through their parent epic's `epicShown()` —
stories carry no filter fields of their own. The Next-up strip stays
epic-level in both modes.
