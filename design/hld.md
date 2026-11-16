# hld.md — agent-board architecture map

**Status: Current — checked against the code 2026-11-15** (after epics B40–B45, B47 and B49).

Where each part of the tool lives and what it owns. Everything here is
**built** unless marked *proposed*; proposals live as cards in
`roadmap/ideas.json` and `roadmap/epics.json`, not in this file. Data
schemas are in [`AGENTS.md`](../AGENTS.md) §2; the UI is specified screen by
screen under [`design/`](DESIGN.md).

## Shape

One codebase, many projects. A project is a directory of five JSON files
(its data dir), registered by name in `projects.json`. Every surface reads
those files directly; none of them is required for the others to work.

```text
 FINDING A BOARD
   projects.json ─┬─ resolve.js ─────── board-cli.js, mcp-server.js
                  ├─ server.js          (re-reads it when the file changes)
                  └─ board (launcher) ─ doctor-cli.js
   BOARD_DATA_DIR pins every one of them to a single data dir

 READING AND WRITING
   <data dir>/*.json
      │   read-data.js   read with defaults + a revision per file (hash of its bytes)
      │   write-data.js  atomic write (temp file, rename), returns the new revision
      ├──────────────┬────────────────┬─────────────────┐
   server.js     board-cli.js    mcp-server.js     doctor-cli.js
   HTTP + SSE    next, status,   stdio MCP: reads   reads the files
      │          show, new       and claim, move,   itself
      │          (reads only;    release, needs-
      │          new scaffolds)  human, propose-idea
      │                          (direct writes, no revision check)
      │  GET /api/board ............ data + revisions
      │  PUT /api/<file> + If-Match  200 new revision │ 409 stale, nothing written
      │  GET /api/events ........... SSE: a file changed
   index.html   on 409: refetch, re-apply the human's own field edits, retry

 SHARED RULES (no I/O)
   queue.js   selection, exclusion reasons, waiting-on-you, stale claims
   doctor.js  invariants
   loaded by the page as <script>, require()d by every CLI
```

## Parts

| Path | Owns |
|---|---|
| `board` | Bash launcher: serve, stop (by listening port only), list, and dispatch to the CLIs (`next`, `status`, `show`, `doctor`, `new`). Resolves a project name for `doctor` itself. On every run, read-only CLI commands included, links each `.claude/agents/*.md` into `~/.claude/agents/` (any message to stderr, so `--json` stays clean); when it serves or lists, and in `setup`, it also links the skill into `~/.claude/skills/`. Leaves alone any same-named file that is not its own link (B47). |
| `server.js` | Local HTTP server on 127.0.0.1. Serves `index.html`, `queue.js` and `doctor.js` to the page; `/api/board` (all five files plus their revisions); `PUT /api/<resource>`, which requires `If-Match` and answers `409` without writing when the file changed since the page read it; `/api/events` (SSE on data-dir changes); `/api/pending` (uncommitted changes as card-level statements); `/api/history` (git log of the data dir, with saves per day for the History calendar) and `/api/history/<hash>`; `/api/since/<hash>` (the briefing); `/llms.txt`, `/docs`, `/AGENTS.md`, `/PROTOCOL.md`. Multi-project mode prefixes routes by project and re-reads `projects.json` when it changes. |
| `index.html` | The whole UI: one vanilla HTML/JS file, no build step. Screens are specified in `design/*.md`. Saves are conditional: on a `409` it refetches, merges by record and field against what it loaded (the human's value wins a same-field conflict) and retries. Cards have URLs (`#/board/<id>`). The one place the page creates work cards itself: Remove from board on an epic whose notes lack an `Architecture:` line, a `Code health:` line, or both adds one ready review story covering whichever is missing under a standing `Closing reviews` epic (tag `closing-reviews`, created on first need) and writes the matching `… review queued as <id>` line(s) on the closed epic, saving `epics.json` and `stories.json` as two separate conditional `PUT`s (B45, B47). |
| `queue.js` | Pure selection rule (PROTOCOL §3), the story ready queue with a reason for each excluded story, stale claims, and `waitingOnYou()` (everything that waits on a person, derived). Loaded by the UI and required by the CLIs, so both compute the same answer. |
| `doctor.js` | Pure invariant checks over the five resources, errors and warnings. Shared by the UI and every CLI. Reads the stale-claim rule from `queue.js` (the page's `BoardQueue`, or `require` in node). Also exports the tests for an epic's closing lines (`hasArchitectureLine`, `hasCodeHealthLine`, `queuedReviews`, `isReviewsEpic`), which the page calls rather than restating. Its `no-architecture-line` warning fires once every story of an un-archived epic is in the review or done lane (a story-less epic: its own card done), and on an epic archived after 2026-11-14; a queued line counts as recorded (B47). |
| `doctor-cli.js` | Terminal front end for `doctor.js`; adds the one check that needs the filesystem (`context_docs` paths that do not exist). Exits 1 only on errors. |
| `board-cli.js` | Terminal `next`, `status`, `show` (one card with its epic, siblings and deps) and the `new` scaffold; `--json` on the read commands. `status` lists the epics owing a closing review (architecture, code health) by id, taken from `doctor.js`'s findings (`closingOwed` in `--json`) (B47). Never edits existing board data. |
| `mcp-server.js` | Stdio MCP server: status/next plus claim, move, release, needs-human and propose-idea tools, for agents without the Claude Code skill. Move and release append to `notes` under a dated header. Writes go through `write-data.js` (atomic) but are not revision-checked — the same race profile as a hand edit (PROTOCOL §5). |
| `resolve.js` | Project lookup for `board-cli.js` and `mcp-server.js`: registered name, literal directory, or `BOARD_DATA_DIR`. `server.js` and the launcher read `projects.json` themselves. |
| `read-data.js` / `write-data.js` | One read path (defaults, wrapped shapes) and one write format (pretty JSON, trailing newline). A read returns each file's revision (a hash of its bytes); a write is atomic (temp file, then rename) and returns the new revision, which the server's `If-Match` check on UI saves compares against. |
| `defaults.js` | The five resource files and their empty defaults. |
| `data/` | Example defaults a new project is scaffolded from — not a live board. |
| `roadmap/` | This checkout's own live board (gitignored). |
| `.claude/skills/agent-board/` | The agent skill that operates boards by editing JSON directly — the one source file. `./board` links it into `~/.claude/skills/`; `.agents/skills/agent-board/SKILL.md` is a tracked link to the same file, which is where Codex looks. |
| `.claude/agents/architecture-reviewer.md` | The subagent that does AGENTS.md §6 step 8 when an epic closes, on a Fable model: reads the epic through `./board show` and its commits, updates that project's `design/hld.md` (the only kind of file it may edit, with the diagrams the epic links), also reads every design doc under `design/` that the epic's commits or working tree added or changed, linked from `context_docs` or not, and links a new one from `hld.md` (marked proposed where it is not built) without ever editing the design doc itself (B49), returns the epic's `Architecture:` line; the builder writes the line, since it never writes board JSON. `./board` links it into `~/.claude/agents/` (on every run, read-only commands included) so any project's session can dispatch it; a harness without subagents does the step itself (B47). |

## Invariants

- **The JSON files are the backlog.** Servers and CLIs are lenses; agents
  may edit the files with nothing running.
- **Git is the only persistence.** A commit in the project's context repo
  is the human ratifying the working state; the tool never commits.
- **Zero dependencies.** Node 18+ standard library only.
- **One rule, one module.** Selection lives in `queue.js` and invariants in
  `doctor.js`, shared by every front end. The 48-hour stale-claim rule is
  `queue.js`'s `isStale()`; the page and `doctor.js` call it (B42-1). What
  counts as a recorded `Architecture:` or `Code health:` line is
  `doctor.js`'s; the page's Remove from board asks it (B45), and `./board status` lists the reviews owed from its findings (B47).
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
