# hld.md — agent-board architecture map

**Status: Current — checked against the code 2026-11-15** (after epics B40–B45, B47, B49, B50 and B55).

Where each part of the tool lives and what it owns. Everything here is
**built** unless marked *proposed*; proposals live as cards in
`roadmap/ideas.json` and `roadmap/epics.json`, not in this file. Data
schemas are in [`AGENTS.md`](../AGENTS.md) §2; the UI is specified screen by
screen under [`design/`](DESIGN.md).

## Shape

One codebase, many projects. A project is a directory of six JSON files
(its data dir), registered by name in `projects.json`; the sixth,
`capabilities.json`, is optional and reads as empty when absent (B50).
Every surface reads those files directly; none of them is required for
the others to work. A running server also keeps `journal.jsonl` there —
its change journal, working state between two saves and not a seventh
resource: only `server.js` writes it, and nothing but `/api/pending`
reads it (B55).

```text
 FINDING A BOARD
   projects.json ─┬─ resolve.js ─────── board-cli.js, mcp-server.js
                  │     └─ also doctor-cli.js, for capability checks only
                  ├─ server.js          (re-reads it when the file changes)
                  └─ board (launcher) ─ doctor-cli.js
   BOARD_DATA_DIR pins every one of them to a single data dir

 ACROSS BOARDS (capabilities only)
   a capability link "<project>:<id>" ── resolve.js findCard() ── reads that
   project's epics, stories and ideas through read-data.js; never writes
   used by board-cli.js, mcp-server.js and doctor-cli.js — not by the page

 READING AND WRITING
   <data dir>/*.json
      │   read-data.js   read with defaults + a revision per file (hash of its bytes)
      │   write-data.js  atomic write (temp file, rename), returns the new revision
      ├──────────────┬────────────────┬─────────────────┐
   server.js     board-cli.js    mcp-server.js     doctor-cli.js
   HTTP + SSE    next, status,   stdio MCP: reads   reads the files
      │          show, new,      and claim, move,   itself
      │          capabilities    release, needs-
      │          (reads only;    human, propose-idea
      │          new scaffolds)
      │                          (direct writes, no revision check)
      │  GET /api/board ............ data + revisions
      │  PUT /api/<file> + If-Match  200 new revision │ 409 stale, nothing written
      │  GET /api/events ........... SSE: a file changed
      │  GET /api/pending .......... unsaved changes, each with source + time
   index.html   on 409: refetch, re-apply the human's own field edits, retry
                ↩ revert: one unsaved change undone through the same PUT

 THE CHANGE JOURNAL (server.js only; B55)
   PUT from the page ─────────────── "page" ─┐
   watcher sees a file differ from the       ├─ append ─ <data dir>/journal.jsonl
   server's last-known snapshot ──── "disk" ─┘   one line per card-level change:
                                                 statement, time, before/after values
   read by /api/pending only; trimmed to the entries since the last commit of
   the data files (capped at 300 where git holds none); not in defaults.js
   FILES, so never watched, served by /api/board, or scaffolded; kept out of
   git by the data dir's .gitignore

 SHARED RULES (no I/O)
   queue.js   selection, exclusion reasons, waiting-on-you, stale claims,
              capability words, derived state and order
   doctor.js  invariants
   loaded by the page as <script>, require()d by every CLI
```

## Parts

| Path | Owns |
|---|---|
| `board` | Bash launcher: serve, stop (by listening port only), list, and dispatch to the CLIs (`next`, `status`, `show`, `capabilities`, `doctor`, `new`). Resolves a project name for `doctor` itself. On every run, read-only CLI commands included, links each `.claude/agents/*.md` into `~/.claude/agents/` (any message to stderr, so `--json` stays clean); when it serves or lists, and in `setup`, it also links the skill into `~/.claude/skills/`. Leaves alone any same-named file that is not its own link (B47). |
| `server.js` | Local HTTP server on 127.0.0.1. Serves `index.html`, `queue.js` and `doctor.js` to the page; `/api/board` (all six files plus their revisions — whatever `defaults.js` `FILES` lists, `capabilities` as `[]` when its file is absent); `PUT /api/<resource>`, which requires `If-Match` and answers `409` without writing when the file changed since the page read it; `/api/events` (SSE on data-dir changes); `/api/pending` (uncommitted changes as card-level statements, capability records included, each with its field values before and after and the journal's `sources` — page or disk, and when; on a data dir git holds no history for, the journal's last 50 entries instead); `/api/history` (git log of the data dir, with saves per day for the History calendar) and `/api/history/<hash>`; `/api/since/<hash>` (the briefing); `/llms.txt`, `/docs`, `/AGENTS.md`, `/PROTOCOL.md`. Multi-project mode prefixes routes by project and re-reads `projects.json` when it changes. Keeps the change journal (B55): a last-known snapshot of each data dir in memory, and `journal.jsonl` in the data dir, to which it appends every card-level change it sees — a `PUT` as `page` (after first recording any disk edit it had not yet seen), anything else the watcher finds differing from the snapshot as `disk`, so a page write's own echo is journalled once. It can tell a page write from a disk edit, not which agent or editor made the edit. The journal is appended directly and trimmed by its own temp-file rename, not through `write-data.js`; failing to write it never fails a save, and it is dropped back to the entries since the last commit of the data files each time it is read (300 at most where git holds none). |
| `index.html` | The whole UI: one vanilla HTML/JS file, no build step. Screens are specified in `design/*.md`. Saves are conditional: on a `409` it refetches, merges by record and field against what it loaded (the human's value wins a same-field conflict) and retries. Cards have URLs (`#/board/<id>`). It holds `capabilities` as a sixth resource — loaded, live-reloaded, saved and counted as pending like the others — but no screen renders the registry yet; a Capabilities tab is *proposed* (epic B51). The pending panel shows each unsaved change's source and time from `/api/pending` and offers `↩ revert` on it: the page restores that one change's before-values in its own state and saves through the normal conditional `PUT` — no separate write path — refusing, with nothing written, when the card changed again since; a reorder has no revert (B55). The one place the page creates work cards itself: Remove from board on an epic whose notes lack an `Architecture:` line, a `Code health:` line, or both adds one ready review story covering whichever is missing under a standing `Closing reviews` epic (tag `closing-reviews`, created on first need) and writes the matching `… review queued as <id>` line(s) on the closed epic, saving `epics.json` and `stories.json` as two separate conditional `PUT`s (B45, B47). |
| `queue.js` | Pure selection rule (PROTOCOL §3), the story ready queue with a reason for each excluded story, stale claims, and `waitingOnYou()` (everything that waits on a person, derived). Also the capability registry's rules (B50): its fixed words (kinds, impacts, adoption states, the two stored statuses), `capabilityState()` (overall state derived from adoption, never stored, except a human-set `skipped`/`retired`), `capabilityOrder()` (impact, then dependencies, then file order), `parseRef()` for `<project>:<id>` links, and `capabilities()` (the ordered list with counts). Loaded by the UI and required by the CLIs, so both compute the same answer. |
| `doctor.js` | Pure invariant checks over the six resources, errors and warnings. Shared by the UI and every CLI. Reads the stale-claim rule from `queue.js` (the page's `BoardQueue`, or `require` in node), and the capability words too: when a board holds capability records it checks them — duplicate or missing ids, a dependency that names no capability or forms a cycle (errors); unknown kind, impact, status or adoption state, an area outside `config.capability_areas`, a `skipped`/`retired` record with no reason, an own-board link to no card (warnings). It sees one board, so links to other boards are `doctor-cli.js`'s (B50). Also exports the tests for an epic's closing lines (`hasArchitectureLine`, `hasCodeHealthLine`, `queuedReviews`, `isReviewsEpic`), which the page calls rather than restating. Its `no-architecture-line` warning fires once every story of an un-archived epic is in the review or done lane (a story-less epic: its own card done), and on an epic archived after 2026-11-14; a queued line counts as recorded (B47). |
| `doctor-cli.js` | Terminal front end for `doctor.js`; adds the checks that need the filesystem or the registry: `context_docs` paths that do not exist, a capability adoption naming a project not in `projects.json`, and a capability's `<project>:<id>` link that resolves to no card on that board (through `resolve.js`) (B50). Exits 1 only on errors. |
| `board-cli.js` | Terminal `next`, `status`, `show` (one card with its epic, siblings and deps — or a capability with its adoption, dependents and linked cards' lanes), `capabilities` (the registry grouped by derived state with each project's adoption) and the `new` scaffold (six files, plus a data-dir `.gitignore` listing `journal.jsonl` when the directory has none — an existing one is never edited, only noted) (B55); `--json` on the read commands. `status` adds a Capabilities count line when the board holds any (B50). `status` lists the epics owing a closing review (architecture, code health) by id, taken from `doctor.js`'s findings (`closingOwed` in `--json`) (B47). Never edits existing board data. |
| `mcp-server.js` | Stdio MCP server: status/next, a read-only `capabilities` tool returning the same report as `./board capabilities --json` (B50), plus claim, move, release, needs-human and propose-idea tools, for agents without the Claude Code skill. Move and release append to `notes` under a dated header. Writes go through `write-data.js` (atomic) but are not revision-checked — the same race profile as a hand edit (PROTOCOL §5). |
| `resolve.js` | Project lookup for `board-cli.js` and `mcp-server.js`: registered name, literal directory, or `BOARD_DATA_DIR`. `server.js` and the launcher read `projects.json` themselves. Also the capability registry's cross-board side (B50): `findCard()` resolves a link — a bare id on the board's own data, or `<project>:<id>` by reading that registered project's epics, stories and ideas — and `capabilityReport()` builds the one report shape (registry order, derived state, links resolved to card and lane; columns are the registered projects) shared by `board-cli.js` and `mcp-server.js`; `doctor-cli.js` uses `projects()` and `findCard()` for its two capability checks. |
| `read-data.js` / `write-data.js` | One read path (defaults, wrapped shapes) and one write format (pretty JSON, trailing newline). A read returns each file's revision (a hash of its bytes); a write is atomic (temp file, then rename) and returns the new revision, which the server's `If-Match` check on UI saves compares against. |
| `defaults.js` | The six resource files and their empty defaults (`capabilities.json` defaults to `[]`). `server.js`'s `/api/board` serves whatever `FILES` lists. |
| `data/` | Example defaults a new project is scaffolded from — not a live board. |
| `roadmap/` | This checkout's own live board (gitignored). The shared capability registry — one record per reusable capability, with its adoption in every project — belongs here as `roadmap/capabilities.json` (AGENTS.md §2); the file does not exist yet, so the registry is empty (B50). |
| `.claude/skills/agent-board/` | The agent skill that operates boards by editing JSON directly — the one source file. `./board` links it into `~/.claude/skills/`; `.agents/skills/agent-board/SKILL.md` is a tracked link to the same file, which is where Codex looks. |
| `.claude/agents/architecture-reviewer.md` | The subagent that does AGENTS.md §6 step 8 when an epic closes, on a Fable model: reads the epic through `./board show` and its commits, updates that project's `design/hld.md` (the only kind of file it may edit, with the diagrams the epic links), also reads every design doc under `design/` that the epic's commits or working tree added or changed, linked from `context_docs` or not, and links a new one from `hld.md` (marked proposed where it is not built) without ever editing the design doc itself (B49), returns the epic's `Architecture:` line; the builder writes the line, since it never writes board JSON. `./board` links it into `~/.claude/agents/` (on every run, read-only commands included) so any project's session can dispatch it; a harness without subagents does the step itself (B47). |

## Invariants

- **The JSON files are the backlog.** Servers and CLIs are lenses; agents
  may edit the files with nothing running.
- **Git is the only persistence.** A commit in the project's context repo
  is the human ratifying the working state; the tool never commits. The
  change journal is not a second store: it holds only what happened
  since the last save, is never committed, and losing it loses no board
  data — only the source and time of unsaved changes (B55).
- **Zero dependencies.** Node 18+ standard library only.
- **One rule, one module.** Selection lives in `queue.js` and invariants in
  `doctor.js`, shared by every front end. The 48-hour stale-claim rule is
  `queue.js`'s `isStale()`; the page and `doctor.js` call it (B42-1). What
  counts as a recorded `Architecture:` or `Code health:` line is
  `doctor.js`'s; the page's Remove from board asks it (B45), and `./board status` lists the reviews owed from its findings (B47). A capability's overall state, the registry's order and its fixed words are `queue.js`'s; how a link resolves to a card, on this board or another, is `resolve.js`'s `findCard()` (B50).
- **Writes through the server cannot silently lose work.** Every `PUT` is
  conditional on the revision the page read; direct file edits and MCP
  writes are not, and PROTOCOL §5 says how to live with that.
- **Vocabulary comes from each project's `config.json`.** No lane, theme,
  priority or milestone name is hardcoded.
- **Local only.** The server binds to 127.0.0.1 and makes no outbound calls.

## Not enforced

`./board doctor` validates board data, not directory layout. The project
layout is a written contract in
[`PROJECT-STRUCTURE.md`](../PROJECT-STRUCTURE.md); a layout validator is
*proposed* at most.
