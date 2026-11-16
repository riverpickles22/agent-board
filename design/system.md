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

**Board — execution state.** Lane colour is **positional**, so it
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
│ {view.title} [Ideas][Milestones][Board] {counts} ● saved (◉ 9 waiting) │ header
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
| Title | `#board-title` | `config.view.title` (fallback "Board") | `document.title` is set by `updateWaiting()` (below): the view title, prefixed with the waiting count |
| Waiting on you | `#wait-badge` `updateWaiting()` `#wait-panel` `renderWaiting()` `WAIT_PARTS` | one derived count of what only a person can move — open `needs`, cards in the review lane, ideas ready for review, ideas ready to implement but not promoted, first-lane stories awaiting the ready flag — in three places: the **tab title** (`(9) {view.title}`, plain at zero), the **favicon** (`drawFavicon()` `#favicon`: an inline-SVG data URI of three lane bars in `--accent`, plus a `--lane-2` dot while the count is above zero), and a header chip beside the doctor's (`◉ 9 waiting on you` amber, `○ nothing waiting` dim). The chip's tooltip names the parts; click opens a slide-over listing every item under its part, each id a link to its card or idea | the rule is `BoardQueue.waitingOnYou()` (`queue.js`), shared with `./board status`, run over `diskView()` (the doctor's un-rescued view) — so the number equals the CLI's on the same files and is never recomputed here. Recomputed in `applyBoard()` (load and every live refresh) and at the start of every `persistResource()`, so a decision or an Accept moves it at once. The favicon reads the token values at draw time and redraws on a theme flip. No Notification API, no sound: the title and the dot are the whole alert |
| Card URLs | `noteCardOpen()` `leaveCardRoute()` `routeCard()` `openCard()` `cardHash()` | every epic and story card has an address, `#/board/<id>` (under a project prefix, `/<name>/#/board/<id>`). Loading it opens that card's modal; an unknown id opens the board and toasts that no card carries it | opening a card from anywhere (board, palette, doctor, a link) **pushes** its hash, so Back closes it; moving from one card to another inside the modal (Back to epic, a story row) **replaces** it, so one Back still closes. Closing by Escape, ✕, Save or Accept goes back to the entry the card was opened from (`#/board` when opened from the board); a card loaded straight from its URL closes to `#/board`. Cards open only on a real hash change or the first load — never on the `route()` a live refresh runs, so a refresh cannot reopen a card you just shut. `cardOpen` tracks which card the modal shows; create modals have no address |
| Id links | `linkIds()` `.idlink` | the id that opens each change statement — in the review panel, the briefing (statements and stale claims) and every History entry — as a link: an epic or story to `#/board/<id>`, an idea to `#/ideas/<id>` | only ids a card or idea still carries become links; a removed card's id stays text. Following a link from a slide-over panel closes the panel |
| View tabs | `#tabs` `renderTabs()` | Ideas / Board / History / Docs — capture, then work, plus the record and the capabilities page | from `PAGES` + `PAGE_LABELS`; `aria-selected` tracks route; bad-hash fallback is `HOME_PAGE`. `PAGE_ALIASES`/`resolvePage()` keep `#/execution` and `view.default_page: "execution"` resolving after the page was renamed to Board and back, so no project's `config.json` ever needed editing |
| Counts | `#counts` | "N cards · M done", or "X of N shown" when filtered | board page only — hidden elsewhere by `route()` |
| Save indicator | `#save` `persistResource()` | dot + saved / saving… / saved · merged / save failed | dot color: `--lane-5` / `--lane-2` pulsing / `--lane-4`. "saved · merged" means the write was refused as stale and landed after `mergeResource()` (below); "save refused — the file keeps changing; reload" after three refused rounds |
| Pending badge | `#pending-badge` `updatePending()` | "N pending" chip beside the save dot when uncommitted board changes exist (`GET /api/pending`); absent when the tree is clean. On a data dir with no git history it reads "N changes" while the change journal holds entries, and is absent otherwise | click → the review panel. Refetched on load, after every live `refresh()`, when the tab regains visibility (covers terminal-side commits), and on panel open |
| Briefing banner | `#briefing` `wireBriefing()` | "Since you last looked: N changes · M stale claims" bar under the header, with **view** (expands to the card-level statements + the stale-claim list) and **dismiss** | shows only when the per-browser last-seen HEAD (`localStorage`, keyed by board title like the mode memory) is older than the current HEAD with actual statements between (`GET /api/since/<hash>`); first visit stores silently; a rewritten-history marker resets silently. Dismiss stores the new HEAD. Stale claim = `claimed_by` set, `claimed_at` older than 48h, card not in the done lane and not in the review lane (there it waits on the human, B36) — computed client-side over epics + stories. Briefing covers **ratified** history (commits); the pending badge covers the unratified working state — the two never overlap |
| Review panel | `#pending-panel` `renderPending()` `pendingLine()` `pendingSource()` `revertChange()` `.pp-meta` `.pp-src` `.pp-rev` | slide-over from the right: "Pending ratification" header, card-level change statements grouped by resource (epics / stories / ideas / config / milestones / capabilities), each with a meta line — **source and time** (`page · 2:14 PM`, `disk · 2:16 PM`, `page + disk · 2:16 PM · 3 changes` when several journal entries touched the card; hover lists them) and a right-aligned **↩ revert** button — then the files list, and a footer naming the ritual (say "save" in conversation, or commit the data dir) and what revert does | sources come from the server's change journal (`journal.jsonl`, AGENTS.md §3): `page` is a PUT from a board page, `disk` any other edit to the file — the server cannot tell which agent, and the panel never pretends to. A statement with no journal entry reads *source not recorded* (changed before this server was watching). **↩ revert** undoes that one statement through `persistResource()` (the normal If-Match save, merging on 409 — no new write path): only the fields the statement changed are restored (lane, fields, `updated_at`), an added card is removed, a removed one re-inserted at its old index, so every other unsaved change — on the same card too — survives; reverting every statement leaves the files byte-equal to HEAD. Before writing it checks that each field still holds the value the statement produced (ignoring `updated_at`); if not, toast "Not reverted — <id> changed again since. Nothing was changed." and no write. A queue reorder shows *drag to undo* and no button. The panel still never ratifies. **No git history** for the data dir: the server's reason, then "Recent changes" — the journal's last 50 entries newest first, each with its own source, time and revert from the entry's own before-values. Empty state: "Everything ratified — board matches HEAD." Close: ✕, Escape, or click outside. Statements come from the server's semantic differ (`/api/pending`): moves as `old → new`, edits name their fields, a queue reorder is one statement |
| View sections | `#view-board` `#view-ideas` `#view-history` `#view-docs` | one visible per route | `route()` toggles `hidden`; `.view.scroll` variants scroll |
| Footer hints | `#footer-note` `updateFooter()` | per-page interaction hints | board / ideas / history / docs variants |
| Stories note | `#stories-note` | "N stories" when any exist | |
| Data path | `#data-path` | the data dir the server reports | static "./data" today (see Open questions) |
| Project switcher | `#projsel` `.projsel` `wireProjects()` `PROJECT` `api()` | the current board's name beside the title, listing the registered ones; choosing another opens it on the equivalent page | one server serves every board and the project is the URL's **path prefix** (`/<name>/#/board`), so it is shareable, the server can read it without JavaScript, and the hash router never learns the project exists. `api()` prefixes every request; switching is a navigation, not a fetch. A card id in the hash is dropped when switching — ids are per-project, so carrying one across would land on nothing. Hidden entirely when only one board is served, and a project whose directory is missing renders disabled rather than being silently dropped |
| Doctor chip | `#doctor-badge` `.dxbadge` `updateDoctor()` | `⚕ clean` dim, `⚕ N issues` amber, or `⚕ N errors` red, beside the pending badge | quiet by construction — a clean board still says so, but only findings raise the colour, because a check that always shouts gets ignored. Runs `BoardDoctor.diagnose()` (the same `doctor.js` `./board doctor` requires — served as a static file, not an endpoint) over the state already in memory, so there is no fetch and no chance of the two front ends drifting |
| Doctor panel | `#doctor-panel` `renderDoctor()` `.dx-row` | the findings grouped by severity, each with its ids and check code; clicking an id opens that epic, story or idea | reuses the pending panel's shell and its stance: **reporting only, nothing is repaired for you**. An id that opens nothing says so — which is usually the finding itself |
| Doctor vs the rescue | `rawColumns` `applyBoard()` | the UI reports a card's **real** lane, not the first-lane rescue `applyBoard()` applies to make an unknown lane renderable | otherwise the browser would call a board clean that the CLI calls broken. The rescue stays (a card nothing can place is worse than a wrong one) but it is undone for the check, never for the state |
| Theme toggle | `#theme-t` `.themet` `wireTheme()` `currentTheme()` | ☾ / ☀ in the header's right cluster, before the save dot | unset follows the OS (the `prefers-color-scheme` blocks); one click pins a choice and `localStorage` keeps it. The key carries **no board title** — unlike the lens and the board mode, a colour preference belongs to the person, not the project. An inline script in `<head>` applies the saved value **before first paint**, so the page never flashes the other scheme. The glyph shows what you would switch *to*, because a button should say what it does; while still following the OS, it repaints when the OS flips |
| Card peek | `wirePeek()` `showPeek()` `.peek` `PEEK_DELAY` | dwell **1s** on any epic, story or idea card and a popover appears beside it with what the card had no room for: full description, acceptance criteria (and, for a story, its how-to-test steps) or story list, claim, and a footer of the small facts | the board is a scanning surface, and opening a card to answer "what is this again?" costs a modal and a click back. Not a `title` tooltip: those are unstyled, truncate, and cannot render the computed state chip. Not instant either — a popover that fires while you sweep the board is noise, so it waits for a dwell that means *this one*. Once shown it **takes the pointer**: you can move onto it and scroll its own overflow (a long criteria list must be readable, not glimpsed), and it stays while the mouse is on it — leaving the card gives a 250ms grace to cross the gap. The left border takes the card's own colour (lane for board cards, stage for ideas). Idea and epic peeks show dependencies (`pkDeps`, `.pkdeps`) under **Depends on · X/Y done** as the **same chips** the card and deep dive use (`depRowEl`: done vivid `--st-ready` with ✓, open muted, X/Y completed past the budget) — and since the peek takes the pointer, the chips are clickable there too: idea → its deep dive, epic → the board with its card open, expand → the peek redraws in place. Anything *outside* the peek that means "I have moved on" — mousedown, dragstart, wheel, scroll, keydown, leaving card and peek both — cancels it, dwell timer included; the same gestures inside the peek are reading it, not leaving it |
| Peek robustness | `cardKey()` `cardByKey()` | the dwell tracks the card's **identity**, not its DOM node, and re-finds it when the timer fires | cards are replaced wholesale on every re-render and a live board re-renders while you dwell — keying on the node meant an agent moving an unrelated card two rows away silently cancelled your peek. The reveal forces a reflow rather than waiting on `requestAnimationFrame`, which never runs in a throttled or occluded tab and would leave the box positioned but permanently invisible |
| Modal shell | `#scrim` `#modal` | dialog for epic / story / idea editing | `.scrim.on` shows; click-outside and Escape close via `closeModal()`. Two widths: `.modal` (560px) for the Ideas core-fields form, and `.modal.wide` (940px, two columns, sticky header + pinned actions) for the board's cards — see the card modal in `board.md`. Each renderer sets `modal.className`, so the shell never inherits the previous card's shape |
| Modal fields | `.field` `.field.row2` `.field.mono` | label + input/textarea/select | `.mono` variant for ids, tags, paths. Inside `.modal.wide` a `.field`'s label becomes a small-caps **section heading** and its textarea sizes to its content (`autoGrow()`); `.rdy-t` opts out, staying a checkbox with a sentence |
| Buttons | `.btn` `.btn.primary` `.btn.danger` | actions row (`.actions`) | danger sits `margin-left:auto` |
| Toast | `#toast` `showToast()` | transient message, bottom-center | 4.5s, `--lane-4` left border — used for refused moves, and to say a save merged with edits made on disk (naming any card both sides changed) |
| Command palette | `#pal-scrim` `#palette` `openPalette()` | top-centered overlay on its own scrim: search input + up to 12 ranked results (type chip · mono id · title) over every epic, story, and idea | opened with `/` anywhere outside form fields and modals; subsequence fuzzy match (`fuzzyScore()` — gaps and late first-hits penalized) over `id + title`, in-memory index rebuilt per keystroke from `state` (always current, no cache). ↑/↓ move the selection, Enter/click jumps: epic → `goToEpic()` (board, flash), story → its modal (scrim on, then `renderStoryModal()`), idea → its deep-dive page. Escape or scrim click closes |
| Quick capture | (global keydown) | `n` outside fields/modals → `openIdea(null)` from any page | capture is the funnel's mouth — no navigation to the Ideas page needed; create still lands in the inbox and jumps to the deep dive |
| Pills | `.tagpill` `.tagpill.sys` `.st` `.prio` | milestone/theme/tag, systems, status, priority (variants p0–p3) | priority class = index into `config.priorities` (`prioClass()`) |
| Helpers | `esc()` `short()` `opts()` `laneVar()` | escaping, "M0 Reliable…"→"M0", select options, lane color cycling | used by every screen. `opts()` keeps a current value the vocabulary doesn't list as one extra selected option, labelled "(not in vocabulary)", so saving a form never silently rewrites it (a story of kind `bug`, an off-vocab theme or conviction) |
| Live refresh | `wireLiveRefresh()` `refresh()` `applyBoard()` | a changed board **moves**: cards lift, glide to their new lane/position, and set down; edited-in-place cards pulse the `.flash` ring; new cards fade in | SSE from `GET /api/events` (server `fs.watch`es the data dir); refetch is skipped when nothing differs (own-write echo) and deferred while a modal is open, a drag is in flight, a save is pending, or the idea deep dive is mid-edit (`refreshBlocked()` `ideaEditing()`, applied on `applyPendingRefresh()`). The stream is reopened if the browser closes it, and every reconnect refetches, since changes made while it was down sent no event |
| Refresh motion | `captureCardPositions()` `animateCardMoves()` `.agent-lift` `.agent-new` | FLIP across the re-render: rects captured before `applyBoard()`, re-render unchanged, moved cards inverted to their old spot then transitioned home (~450ms) wearing the lift look (scale 1.04, `--shadow`, ~1° tilt — the `.dragging` family) | applies to `.card`, `.scard`, and `.idea` cards on whichever page is visible; removed cards simply vanish (no ghost animation); `prefers-reduced-motion` falls back to the instant snap (the global media query kills the transitions) |

## Interactions

- Tab click → `navigate(page)` → hash change → `route()` shows the view;
  writes nothing.
- Escape anywhere / click on scrim backdrop → `closeModal()`; writes
  nothing. Escape closes surfaces in order: palette → test-plan panel →
  any slide-over panel (pending, doctor, waiting) → modal (one layer per
  press). Closing a card returns the hash as described under Card URLs.
- Browser Back with a card open → `routeCard()` closes it; Forward
  reopens it. A `#/board/<id>` typed or pasted into the address bar
  opens that card.
- `/` (outside fields/modals) → palette; `n` → new-idea modal from any
  page; both inert while typing anywhere or while a modal is open.
  Footer hints name them.
- All persistence funnels through `persistResource(resource, val)`:
  150ms debounce per resource (`saveTimers`), `PUT /api/<resource>` with
  the resource's revision in `If-Match` (`putResource()`), save indicator
  cycles; failure shows "save failed — is the server running?".
- A stale save (`409`: the file changed on disk since the page loaded it,
  typically an agent edit while a modal was open) → refetch
  `/api/board`, `mergeResource(baseline, mine, fresh)`, PUT again (up to
  three rounds), toast "Merged with edits made on disk…". The merge starts
  from disk: for each record the human changed against `baseline`, the
  human's changed fields are laid over disk's record (the human wins a
  field both changed, and the toast names that card); records the human
  deleted stay deleted, records the human created are kept, and the
  human's order applies only if the human reordered. Config and
  milestones merge the same way by top-level key. The refresh queued
  afterwards puts the merged state on the page.
- Data file changes on disk (agent or hand edits) → server SSE event →
  debounced `refresh()`: refetch `/api/board`, re-apply state + vocab,
  re-render the current page; filters whose vocab vanished reset to
  "all". Deferred (not dropped) while a modal / drag / pending save is
  active; writes nothing. The change **animates**: an agent's lane move
  reads as pick-up → glide → set-down, not a snap — the manual ↻
  refresh reveals changes the same way. The user's own drags never
  re-animate (own-write echoes are skipped before the animation path).
- Pending-badge click → open the review panel (refetching
  `/api/pending` first); Escape / ✕ / outside click closes it. The one
  write in the panel is **↩ revert**, which undoes a single unsaved
  change through the normal conditional save (or refuses, with a toast,
  when the card changed again since); ratification still happens in
  conversation or git.

## States

- Load failure (`load().catch`): board area shows "Could not load the
  board. Start the server with node server.js and reload."
- Server restart: the `EventSource` reconnects (retry 2s; reopened by
  `wireLiveRefresh()` if the browser gives up) and refetches on reconnect;
  no page reload needed. Revisions are content hashes, so they survive the
  restart.
- Reduced motion: all animation/transitions disabled via media query.
- Pending states: clean tree → no badge; dirty → "N pending" chip;
  data dir not git-tracked or no commits yet → no badge (the panel's
  machinery assumes the git convention; without it the header stays
  quiet rather than nagging). The count can lag a terminal-side commit
  until the next data change, tab refocus, or panel open — all three
  refetch.
- Theme: follows OS unless `data-theme` is stamped on `:root`.

## Data

`load()` fetches `GET /api/board` (each resource plus its `revisions`
entry, kept with a JSON `baseline` by `rememberBaseline()` for the
merge), fills `state` +
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
