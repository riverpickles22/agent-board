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

## Layout frame

```
┌──────────────────────────────────────────────────────────────────────┐
│ LOCAL · AGENT-BOARD                                                  │
│ {view.title}  [Ideas][Milestones][Board]   {counts}  ● saved         │  header
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
| View tabs | `#tabs` `renderTabs()` | Ideas / Milestones / Board / Docs — the flow trio (capture → intent → work) plus the capabilities page | from `PAGES` + `PAGE_LABELS`; `aria-selected` tracks route; bad-hash fallback stays `board` so per-project `view.default_page` semantics are untouched |
| Counts | `#counts` | "N cards · M done", or "X of N shown" when filtered | board page only — hidden elsewhere by `route()` |
| Save indicator | `#save` `persistResource()` | dot + saved / saving… / save failed | dot color: `--lane-5` / `--lane-2` pulsing / `--lane-4` |
| View sections | `#view-board` `#view-milestones` `#view-ideas` `#view-docs` | one visible per route | `route()` toggles `hidden`; `.view.scroll` variants scroll |
| Footer hints | `#footer-note` `updateFooter()` | per-page interaction hints | board / milestones / ideas variants |
| Stories note | `#stories-note` | "N stories" when any exist | |
| Data path | `#data-path` | the data dir the server reports | static "./data" today (see Open questions) |
| Modal shell | `#scrim` `#modal` | dialog for epic / story / idea editing | `.scrim.on` shows; click-outside and Escape close via `closeModal()` |
| Modal fields | `.field` `.field.row2` `.field.mono` | label + input/textarea/select | `.mono` variant for ids, tags, paths |
| Buttons | `.btn` `.btn.primary` `.btn.danger` | actions row (`.actions`) | danger sits `margin-left:auto` |
| Toast | `#toast` `showToast()` | transient message, bottom-center | 4.5s, `--lane-4` left border — used for refused moves |
| Pills | `.tagpill` `.tagpill.sys` `.st` `.prio` | milestone/theme/tag, systems, status, priority (variants p0–p3) | priority class = index into `config.priorities` (`prioClass()`) |
| Helpers | `esc()` `short()` `opts()` `laneVar()` | escaping, "M0 Reliable…"→"M0", select options, lane color cycling | used by every screen |
| Live refresh | `wireLiveRefresh()` `refresh()` `applyBoard()` | — (invisible; the page just stays current) | SSE from `GET /api/events` (server `fs.watch`es the data dir); refetch is skipped when nothing differs (own-write echo) and deferred while a modal is open, a drag is in flight, or a save is pending (`refreshBlocked()`, applied on `applyPendingRefresh()`) |

## Interactions

- Tab click → `navigate(page)` → hash change → `route()` shows the view;
  writes nothing.
- Escape anywhere / click on scrim backdrop → `closeModal()`; writes
  nothing.
- All persistence funnels through `persistResource(resource, val)`:
  150ms debounce per resource (`saveTimers`), `PUT /api/<resource>`,
  save indicator cycles; failure shows "save failed — is the server
  running?".
- Data file changes on disk (agent or hand edits) → server SSE event →
  debounced `refresh()`: refetch `/api/board`, re-apply state + vocab,
  re-render the current page; filters whose vocab vanished reset to
  "all". Deferred (not dropped) while a modal / drag / pending save is
  active; writes nothing.

## States

- Load failure (`load().catch`): board area shows "Could not load the
  board. Start the server with node server.js and reload."
- Server restart: the `EventSource` auto-reconnects (retry 2s); no page
  reload needed.
- Reduced motion: all animation/transitions disabled via media query.
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
