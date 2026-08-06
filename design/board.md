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
├──────────────────┬──────────────────┬────────────────────────────────┤
│ ▍{lane 1}     5  │ ▍{lane …}     2  │ ▍{last lane}                4  │
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
| View toggle | `.chip.mode` | Epics \| Rows, current mode `aria-pressed` | first chips in `#filters`; switches the board area's rendering mode only |
| Filter rows | `renderFilters()` `#filters` | milestone / theme / tag chip rows | rows render only when vocab non-empty; labels via `short()` except tags (full) |
| Next up strip | `renderNextUp()` `#nextup` | top 5 pickable epics as `.pick` chips: id, name, why (priority · unblocks N); "+N more" overflow; or a nothing-pickable reason line (`.none`) | `nextUp()` implements PROTOCOL §3 exactly: first lane + deps done + gate in `open_gates` (`gateOpen()`) + unclaimed + successor lane under `wip_limits` (`wipBlocked()`); ranked priority index → unblock count (`unblockCount()`) → file order. Board-wide — ignores the filter chips |
| Save-view chip | `.chip.savev` `#save-view` | "★ set as default view" | appears only when current filters differ from `viewDefaults()`; writes `config.view` |
| Column | `render()` `.col` | swatch + lane name + shown count | top border + header tint from `--lc` = `laneVar(col)` |
| Add card | `.addcard` | "+ add card" atop each lane body | → `openCreate(col)` with the lane preset |
| Card | `cardEl()` `.card` | id, priority pill, name, milestone/theme/tags/systems pills, status, story badge, dep badge, claim | draggable, tabIndex 0 |
| Story badge | `.stbadge` | "N stories · M ready" | ready count in `--lane-5` |
| Dep badge | `.dep` / `.dep.warn` | `⊸ F2` when deps met, `↯ needs F4` when not | warn = any dep not in done lane |
| Claim | `.claim` | "claimed: {claimed_by}" | accent, only when claimed |
| Move guard | `checkMove()` | — | can't enter done lane with unmet deps; can't leave it while a done dependent points here |
| Drop wiring | `wireDrop()` | drop-hover highlight; refused drop → toast with reason | `.no-drop` columns dim during drag (`body.is-dragging`) |
| Rows: lane strip | `renderSwimlanes()` `.rows-head` | swatch + lane name + story count per lane | sticky atop the scrolling board; same positional `--lc` colors as columns |
| Rows: swimlane | `swimEl()` `.swim` | one row per shown epic with ≥1 story | row order = epic array order (queue order) |
| Rows: row header | `.swim-h` | epic id, name, gate badge (`.egate`, when gate closed), done-count "d/N {last lane}" | click → `openEdit(id)` |
| Rows: cell | `.swim .cell` | the epic's stories in that lane | one per lane per row; drop target via `wireStoryDrop()` |
| Rows: story card | `storyCardEl()` `.scard` | kind chip, mono id, ✓ ready tick, name | draggable within its row; click opens the story modal |
| Rows: note | `.rows-note` | "N epics without stories — shown in Epics mode" / rows-empty guidance | renders only when it has something to say |
| Epic modal | `renderModal()` | all epic fields per AGENTS.md §2 | `context_docs` deliberately has no widget; lane change re-runs `checkMove` |
| Stories section | `storiesSection()` `wireStoriesSection()` | story rows + ready checkboxes inside the epic modal | edit mode only, not on create |
| Story modal | `renderStoryModal()` | story fields: name, description, acceptance criteria (one per line), context, systems, kind ▾, lane ▾, priority ▾, ready ✓ | "Back to epic" returns to `openEdit(epicId)` |
| Save epic | `saveModal()` | validation → create/update | duplicate-id and empty-name errors in `.m-err` |
| Delete epic | `deleteEpic()` | confirm listing dependents + story cascade | deletes epic + its stories |

## Interactions

- Drag card → lane: `checkMove()`; legal → set `column` + `updated_at`,
  `persist()` (= `persistResource("epics", …)`); refused → `showToast(reason)`,
  nothing written.
- View toggle click → set `boardMode`, re-render the board area; writes
  nothing. ★ set as default view persists it as
  `config.view.default_board_mode` via `persistResource("config", …)`.
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
- Click card / Enter on focused card → `openEdit(id)`; writes nothing.
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
- Filtered: counts flip to "X of N shown" (see `system.md` counts).
- Dragging: source card fades (`.dragging`), other cards ignore pointer,
  illegal lanes dim (`.no-drop`), hovered legal lane highlights
  (`.drop-hover`).
- Jump-in from milestones (`goToEpic()`): switches to Epics mode first
  (the `.card[data-id]` target only exists there), filters set to the
  epic's milestone, card scrolled into view with a 1.3s `.flash` ring.
- Unknown card column (stale data): normalized to first lane on load —
  stories too.
- Rows mode, epics without stories: skipped, counted in `.rows-note`.
  Rows mode with no story-bearing epics at all: the note explains and
  points back to Epics mode. Counts in the header flip to story counts.
- Rows mode dragging: same `.drop-hover` / `.no-drop` language as
  columns — other rows' cells and gated rows dim.

## Data

The Next-up strip is the first UI reader of `config.open_gates` and
`config.wip_limits` (previously protocol-only).
`state.epics` filtered by `epicShown()` (milestone AND theme AND tag);
stories via `storiesOf(epicId)`; vocab from `COLUMNS`/`PRIOS`/`THEMES`/
`MILESTONES`; lane color by position (`laneVar`), priority pill class by
index (`prioClass`). New-epic ids suggested as `NEW1…` (`suggestId()`),
story ids `<epic_id>-<n>` (`suggestStoryId()`).
`boardMode` ("epics" | "rows") defaults from
`config.view.default_board_mode` (fallback "epics") via `viewDefaults()`.
Rows mode shows stories only through their parent epic's `epicShown()` —
stories carry no filter fields of their own. The Next-up strip stays
epic-level in both modes.
