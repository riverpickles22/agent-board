---
screen: system
route: "(all)"
spec_state: matches-ui
---

# System — tokens and shared chrome

What every screen shares: the design tokens (named here, valued only in
`index.html`'s `:root`), the header/footer frame, the modal, the toast,
and the save indicator. Screen specs reference these by name.

## Tokens

Values live in `:root` (light), `@media (prefers-color-scheme:dark)`, and
the explicit `:root[data-theme="light"|"dark"]` overrides — four blocks at
the top of `index.html`'s stylesheet. Specs never repeat values.

| Token | Role |
|---|---|
| `--ground` | page background |
| `--panel` | columns, blocks, modal surfaces |
| `--card` / `--card-2` | card surface / inset surface (inputs, story rows) |
| `--ink` / `--ink-2` / `--ink-3` | text: primary / secondary / tertiary |
| `--line` / `--line-2` | borders: standard / hairline |
| `--accent` / `--accent-soft` | interactive + identity color / its wash |
| `--lane-0` … `--lane-5` | per-lane identity colors, cycled by position (`laneVar()`); also reused as semantic colors: `--lane-5` ok/green, `--lane-4` danger/red, `--lane-2` warn/amber |
| `--mono` / `--sans` | code-ish text (ids, paths, tags) / everything else |
| `--shadow` | hover/raised elevation |

Dark theme note: `.prio.p0`, active `.chip`, `.btn.primary`, and hovered
`.chip-epic` flip their text to `#1F1F1F` under `data-theme="dark"` (and
the media-query equivalent) so accent-filled surfaces stay readable.

## The state colour legend

**Colour communicates one thing: state.** The two boards answer
different questions, so each has its own scale — but the rules below
hold on both, and no element may borrow a hue for decoration,
selection, or emphasis. The state tokens alias the existing palette:
this is semantics, not a new look.

**Ideas — a maturity scale.** The ideas page is a funnel deciding what
deserves to enter execution, so colour tracks *how far an idea has
matured*, and the progression reads left to right:

| Token | Alias | Stage | Means |
|---|---|---|---|
| `--st-idle` | `--ink-3` | Back burner | dormant — preserved, not worth design time now |
| `--st-active` | `--accent` | Front burner | actively being shaped; questions still open |
| `--st-decide` | `--lane-2` | Ready for review | shaped enough — awaiting a deliberate product decision |
| `--st-ready` | `--lane-5` | Ready to implement | intent settled; cleared to become executable work |
| `--st-problem` | `--lane-4` | Rejected | the only red on this page |

**Execution — execution state.** Lane colour is **positional**, so it
carries meaning without hardcoding any project's lane names
(`laneVar()`): first lane gray (queued), last green (done), the one
before it amber on boards of four or more lanes (the review position),
accent for the active middle. On top of that, `--st-blocked` marks work
waiting on something outside its own control — a closed gate, an unmet
dependency, or a **`needs`** record, the one state waiting on a *person*
— and `--st-problem` stays for genuine failures: refused moves,
over-WIP counts.

Amber reads the same way on both: **waiting on someone**. On ideas
that's a decision from you; on the board it's a gate or a dependency.

**Three rules keep it deterministic:**

1. **One dimension per channel.** The 3px **left border** carries the
   card's stage and nothing else; anything orthogonal (conviction,
   quick-win, leverage) is a pill or plain text, never a border
   recolour.
2. **The stage must dominate.** On an idea card, the stage colour is
   the *only* colour. Leverage counts, resolved-dependency ticks and
   metadata render neutral — a green tick on a back-burner card makes
   it read "positive" and weakens the stage signal.
3. **Tint stays subtle.** Colour appears as the left border and small
   pills; no heavy card washes. The prose is dense enough.

Red is scarce on purpose: if everything can be red, nothing is. An
unmet dependency is *waiting*, not broken.

## Layout frame

```
┌──────────────────────────────────────────────────────────────────────┐
│ LOCAL · AGENT-BOARD                                                  │
│ {view.title} [Ideas][Milestones][Execution] {counts} ● saved (7 pending)│ header
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                        active view (#view-*)                         │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│ {page hints}          {N stories}                data → {data-path}  │  footer
└──────────────────────────────────────────────────────────────────────┘
```

## Components

| Component | Anchor | Shows | Notes |
|---|---|---|---|
| Eyebrow | `.eyebrow` | "Local · agent-board" | mono, uppercase, accent |
| Title | `#board-title` | `config.view.title` (fallback "Board") | also sets `document.title` in `load()` |
| View tabs | `#tabs` `renderTabs()` | Ideas / Milestones / Execution / History / Docs — the flow trio (capture → intent → work) plus the record and the capabilities page | from `PAGES` + `PAGE_LABELS`; `aria-selected` tracks route; bad-hash fallback is `HOME_PAGE` (the execution page). `PAGE_ALIASES`/`resolvePage()` keep the old `#/board` hash and `view.default_page: "board"` working, so no project's `config.json` needed editing when the page was renamed |
| Counts | `#counts` | "N cards · M done", or "X of N shown" when filtered | board page only — hidden elsewhere by `route()` |
| Save indicator | `#save` `persistResource()` | dot + saved / saving… / save failed | dot color: `--lane-5` / `--lane-2` pulsing / `--lane-4` |
| Pending badge | `#pending-badge` `updatePending()` | "N pending" chip beside the save dot when uncommitted board changes exist (`GET /api/pending`); absent when the tree is clean or the data dir isn't git-tracked | click → the review panel. Refetched on load, after every live `refresh()`, when the tab regains visibility (covers terminal-side commits), and on panel open |
| Briefing banner | `#briefing` `wireBriefing()` | "Since you last looked: N changes · M stale claims" bar under the header, with **view** (expands to the card-level statements + the stale-claim list) and **dismiss** | shows only when the per-browser last-seen HEAD (`localStorage`, keyed by board title like the mode memory) is older than the current HEAD with actual statements between (`GET /api/since/<hash>`); first visit stores silently; a rewritten-history marker resets silently. Dismiss stores the new HEAD. Stale claim = `claimed_by` set, `claimed_at` older than 48h, card not in the done lane — computed client-side over epics + stories. Briefing covers **ratified** history (commits); the pending badge covers the unratified working state — the two never overlap |
| Review panel | `#pending-panel` `renderPending()` | slide-over from the right: "Pending ratification" header, card-level change statements grouped by resource (epics / stories / ideas / config / milestones), files list, footer naming the ritual (say "save" in conversation, or commit the data dir) | read-only — zero write affordances; the panel reviews, the human ratifies. Empty state: "Everything ratified — board matches HEAD." Close: ✕, Escape, or click outside. Statements come from the server's semantic differ (`/api/pending`): moves as `old → new`, edits name their fields, a queue reorder is one statement |
| View sections | `#view-execution` `#view-milestones` `#view-ideas` `#view-docs` | one visible per route | `route()` toggles `hidden`; `.view.scroll` variants scroll |
| Footer hints | `#footer-note` `updateFooter()` | per-page interaction hints | board / milestones / ideas variants |
| Stories note | `#stories-note` | "N stories" when any exist | |
| Data path | `#data-path` | the data dir the server reports | static "./data" today (see Open questions) |
| Modal shell | `#scrim` `#modal` | dialog for epic / story / idea editing | `.scrim.on` shows; click-outside and Escape close via `closeModal()` |
| Modal fields | `.field` `.field.row2` `.field.mono` | label + input/textarea/select | `.mono` variant for ids, tags, paths |
| Buttons | `.btn` `.btn.primary` `.btn.danger` | actions row (`.actions`) | danger sits `margin-left:auto` |
| Toast | `#toast` `showToast()` | transient message, bottom-center | 4.5s, `--lane-4` left border — used for refused moves |
| Command palette | `#pal-scrim` `#palette` `openPalette()` | top-centered overlay on its own scrim: search input + up to 12 ranked results (type chip · mono id · title) over every epic, story, and idea | opened with `/` anywhere outside form fields and modals; subsequence fuzzy match (`fuzzyScore()` — gaps and late first-hits penalized) over `id + title`, in-memory index rebuilt per keystroke from `state` (always current, no cache). ↑/↓ move the selection, Enter/click jumps: epic → `goToEpic()` (board, flash), story → `renderStoryModal()`, idea → its deep-dive page. Escape or scrim click closes |
| Quick capture | (global keydown) | `n` outside fields/modals → `openIdea(null)` from any page | capture is the funnel's mouth — no navigation to the Ideas page needed; create still lands in the inbox and jumps to the deep dive |
| Pills | `.tagpill` `.tagpill.sys` `.st` `.prio` | milestone/theme/tag, systems, status, priority (variants p0–p3) | priority class = index into `config.priorities` (`prioClass()`) |
| Helpers | `esc()` `short()` `opts()` `laneVar()` | escaping, "M0 Reliable…"→"M0", select options, lane color cycling | used by every screen |
| Live refresh | `wireLiveRefresh()` `refresh()` `applyBoard()` | a changed board **moves**: cards lift, glide to their new lane/position, and set down; edited-in-place cards pulse the `.flash` ring; new cards fade in | SSE from `GET /api/events` (server `fs.watch`es the data dir); refetch is skipped when nothing differs (own-write echo) and deferred while a modal is open, a drag is in flight, or a save is pending (`refreshBlocked()`, applied on `applyPendingRefresh()`) |
| Refresh motion | `captureCardPositions()` `animateCardMoves()` `.agent-lift` `.agent-new` | FLIP across the re-render: rects captured before `applyBoard()`, re-render unchanged, moved cards inverted to their old spot then transitioned home (~450ms) wearing the lift look (scale 1.04, `--shadow`, ~1° tilt — the `.dragging` family) | applies to `.card`, `.scard`, and `.idea` cards on whichever page is visible; removed cards simply vanish (no ghost animation); `prefers-reduced-motion` falls back to the instant snap (the global media query kills the transitions) |

## Interactions

- Tab click → `navigate(page)` → hash change → `route()` shows the view;
  writes nothing.
- Escape anywhere / click on scrim backdrop → `closeModal()`; writes
  nothing. Escape closes surfaces in order: palette → pending panel →
  modal (one layer per press).
- `/` (outside fields/modals) → palette; `n` → new-idea modal from any
  page; both inert while typing anywhere or while a modal is open.
  Footer hints name them.
- All persistence funnels through `persistResource(resource, val)`:
  150ms debounce per resource (`saveTimers`), `PUT /api/<resource>`,
  save indicator cycles; failure shows "save failed — is the server
  running?".
- Data file changes on disk (agent or hand edits) → server SSE event →
  debounced `refresh()`: refetch `/api/board`, re-apply state + vocab,
  re-render the current page; filters whose vocab vanished reset to
  "all". Deferred (not dropped) while a modal / drag / pending save is
  active; writes nothing. The change **animates**: an agent's lane move
  reads as pick-up → glide → set-down, not a snap — the manual ↻
  refresh reveals changes the same way. The user's own drags never
  re-animate (own-write echoes are skipped before the animation path).
- Pending-badge click → open the review panel (refetching
  `/api/pending` first); Escape / ✕ / outside click closes it. Nothing
  in the panel writes — ratification happens in conversation or git.

## States

- Load failure (`load().catch`): board area shows "Could not load the
  board. Start the server with node server.js and reload."
- Server restart: the `EventSource` auto-reconnects (retry 2s); no page
  reload needed.
- Reduced motion: all animation/transitions disabled via media query.
- Pending states: clean tree → no badge; dirty → "N pending" chip;
  data dir not git-tracked or no commits yet → no badge (the panel's
  machinery assumes the git convention; without it the header stays
  quiet rather than nagging). The count can lag a terminal-side commit
  until the next data change, tab refocus, or panel open — all three
  refetch.
- Theme: follows OS unless `data-theme` is stamped on `:root`.

## Data

`load()` fetches `GET /api/board`, fills `state` +
`COLUMNS`/`PRIOS`/`THEMES`/`MILESTONES` from `config` via `applyBoard()`
(with fallback vocab; unknown epic/story columns normalize to
`COLUMNS[0]`), applies `config.view` defaults via `viewDefaults()`
(invalid values → "all"), then wires live refresh — after which
`refresh()` re-runs `applyBoard()` whenever the data changes on disk.
Lane semantics are positional: `COLUMNS[0]` todo, last = done
(`doneLane()`).

## Open questions

- `#data-path` renders the literal "./data" — the server doesn't report
  the real data dir. Cosmetic lie when serving a registered project.
