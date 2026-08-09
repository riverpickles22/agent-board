---
screen: board
route: "#/board"
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

## Layout

Epics mode (the default):

```
├──────────────────────────────────────────────────────────────────────┤
│ View (Epics)(Rows)  Milestone (All)({M0})({M1})  Theme (All)({T1})   │
│ Tag (All)(x)                           [★ set as default view]      │  filters
│ Next up  [F2 Epic name…  Now · unblocks 3] [F5 …  Now] +2 more      │  next-up
│ Ready    F1 ▸ [feature F1-2 Story name…] [test F1-3 …]  F3 ▸ […]    │  ready-q
├──────────────────┬──────────────────┬────────────────────────────────┤
│ ▍{lane 1}     5  │ ▍{lane …}  3/2  │ ▍{last lane}                 4  │
│ [+ add card]     │ [+ add card]     │ [+ add card]                   │
│ ┌──────────────┐ │                  │ ┌──────────────┐               │
│ │ F1     (Now) │ │                  │ │ F3    (Next) │               │
│ │ Epic name…   │ │                  │ │ …            │               │
│ │ (M0)(T1)(tag)│ │                  │ └──────────────┘               │
│ │ (sys) status │ │                  │                                │
│ │ 3 stories·1 ready  ⊸ F2  ↯ needs F4  claimed: session             │
│ └──────────────┘ │                  │                                │
├──────────────────┴──────────────────┴────────────────────────────────┤
```

Rows mode (same filters + next-up above; board area becomes swimlanes,
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
│ F3  Epic name…                                       0/2 {last lane} │
│ ┌─────────────┐               │              │                       │
│ └─────────────┘               │              │                       │
├──────────────────────────────────────────────────────────────────────┤
│ 2 epics without stories — shown in Epics mode                        │  note
```

Modal (over everything, via the shared shell in `system.md`):

```
┌─ F1 · Edit card ────────────────────────────┐
│ ID (readonly on edit)   │ Lane ▾            │
│ Name                                        │
│ Description / Notes                         │
│ Milestone ▾             │ Theme ▾           │
│ Priority ▾              │ Status (free)     │
│ Tags                    │ Gate              │
│ Systems involved                            │
│ Depends on                                  │
│ Claimed by              │ Claimed at (ro)   │
│ Stories (N)                                 │
│  [kind] story name      lane  [✓] ready     │
│  [+ add story]                              │
│ [Save] [Cancel]                  [Delete]   │
└─────────────────────────────────────────────┘
```

## Components

| Component | Anchor | Shows | Notes |
|---|---|---|---|
| View toggle | `.chip.mode` | Epics \| Rows, current mode `aria-pressed` | first chips in `#filters`; switches the board area's rendering mode and remembers the choice per browser (`rememberBoardMode()`) |
| Shipped toggle | `.chip[data-arch]` | (Current)(Shipped N) chips after the view toggle — the Ideas page's archive pattern applied to epics | flips `boardArchive` (in-memory, defaults to current); the Shipped chip renders only when archived epics exist (or while viewing them). Shipped view shows `archived_at` epics in both modes, read-only: cards not draggable, next-up + ready strips hidden, counts read "N shipped". Milestone/theme/tag filters apply within each view |
| Filter rows | `renderFilters()` `#filters` | milestone / theme / tag chip rows | rows render only when vocab non-empty; labels via `short()` except tags (full) |
| Next up strip | `renderNextUp()` `#nextup` | top 5 pickable epics as `.pick` chips: id, name, why (priority · unblocks N); "+N more" overflow; or a nothing-pickable reason line (`.none`) | `nextUp()` implements PROTOCOL §3 exactly: first lane + deps done + gate in `open_gates` (`gateOpen()`) + unclaimed + successor lane under `wip_limits` (`wipBlocked()`); ranked priority index → unblock count (`unblockCount()`) → file order. Board-wide — ignores the filter chips |
| Ready queue strip | `readyQueue()` `renderReadyQueue()` `#readyq` | pickable stories as `[kind] id name` chips (`.rpick`) grouped under their epic's mono id — the "begin X" menu | story-grain PROTOCOL §3: `ready: true` + story in the first lane + unclaimed + epic gate open + epic deps done; ranked story priority → epic rank (file order) → story file order, epic groups ordered by their best story. Board-wide like Next up (ignores filters). No stories on the board → strip absent; stories exist but none pickable → one-line reason in Next up's empty language. Click → the story modal |
| Column | `render()` `.col` | swatch + lane name + shown count — or, when the lane has a `wip_limits` entry, `total/limit` (`.ct.wlim`) | top border + header tint from `--lc` = `laneVar(col)`. The WIP count is **board-wide** (total epics in the lane — the number PROTOCOL §3's `wipBlocked()` compares), not the filtered count; over limit → `.over` in `--lane-4` with an explanatory title. Advise-only: limits never block a drop — that stays the agent protocol's job |
| Add card | `.addcard` | "+ add card" atop each lane body | → `openCreate(col)` with the lane preset |
| Card | `cardEl()` `.card` | id, priority pill, name, milestone/theme/tags/systems pills, status, story badge, dep badge, gate chip, claim | draggable, tabIndex 0 |
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
| Story state chip | `storyState()` `.sstate` | one chip from one rule — lane + `ready` + claim + epic health (the ready-queue rule, extended to display). In priority order: done + unfinished siblings → `✓ done · waiting on <sibling>` (+N); done, epic complete → pooled `✓ shipped` / `✓ plated` / `✓ in the books` (stable per story via id hash — variety without randomness); middle lane → activity by `kind`: feature `cooking` · test `testing` · chore `tidying up` · docs `writing` · integration `wiring up` (tooltip: real lane + claim); first lane + ready → `✓ ready` when pickable, `⛔ gated: <gate>` / `⏳ waiting on <dep>` when the epic is blocked, `claimed` when claimed; first lane, not ready → dim `needs prep` | color: green ok / amber blocked / accent active / dim quiet (`--lane-5`/`--lane-2`/accent/`--ink-3`). The same chip renders read-only in the epic modal's story rows beside the lane text — the ready checkbox stays the editor. `✓ ready` never appears outside the first lane |
| Rows: note | `.rows-note` | "N epics without stories — shown in Epics mode" / rows-empty guidance | renders only when it has something to say |
| Epic modal | `renderModal()` | all epic fields per AGENTS.md §2 | `context_docs` renders read-only (below) — still no edit widget; lane change re-runs `checkMove` |
| Context docs chips | `.field .ctxdocs` (modal) | the epic's `context_docs` as read-only label+path+note chips, reusing the Milestones `ctxDocs()` renderer; click copies the doc's path (toast confirms) | edit mode only, and only when the epic has docs — no section otherwise, and the create modal never shows it. Copy-on-click follows the Ideas-page copy convention; **no input exists** — `context_docs` stays file/skill-edited (AGENTS.md §2) |
| Stories section | `storiesSection()` `wireStoriesSection()` | story rows + ready checkboxes inside the epic modal | edit mode only, not on create |
| Story modal | `renderStoryModal()` | story fields: name, description, acceptance criteria (one per line), context, systems, kind ▾, lane ▾, priority ▾, ready ✓ | "Back to epic" returns to `openEdit(epicId)` |
| Save epic | `saveModal()` | validation → create/update | duplicate-id and empty-name errors in `.m-err` |
| Ship & archive | `archiveEpic()` `#m-arch` | "⌂ Ship & archive" button in the edit modal — only when the epic **and every story** sit in the done lane and it isn't archived yet | stamps `archived_at` (AGENTS.md §2), persists, toast; the epic leaves the current view (done cards stay on the board until this moment — the whole epic closes at once). In the Shipped view the button reads "Unarchive" and clears the stamp (the human's call). Archived epics still feed milestone roll-ups and dependency checks — archiving hides, never deletes |
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
- Epics exist but none pickable: strip shows "nothing pickable — …" with
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
