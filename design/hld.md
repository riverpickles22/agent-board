# hld.md — agent-board architecture map

**Status: Current — checked against the code 2026-10-04.**

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
            projects.json  ─┐
          BOARD_DATA_DIR  ──┼─ resolve.js ─┐
                            │              │
  <data dir>/*.json ── read-data.js / write-data.js ── defaults.js
            │                              │
  ┌─────────┼──────────────┬───────────────┼──────────────┐
  server.js │        board-cli.js     mcp-server.js   doctor-cli.js
  (HTTP+SSE)│        next/status/new  (stdio MCP)     (doctor)
     │      │              │               │              │
  index.html ◄── queue.js (selection) ── doctor.js (invariants) ──┘
```

## Parts

| Path | Owns |
|---|---|
| `board` | Bash launcher: serve, stop, list, and dispatch to the CLIs (`next`, `status`, `doctor`, `new`). |
| `server.js` | Local HTTP server on 127.0.0.1. Serves `index.html`, `/api/<resource>` reads and writes, `/api/board`, `/api/events` (SSE on data-dir changes), `/api/history` (git log of the data dir), `/llms.txt`, `/docs`, `/AGENTS.md`, `/PROTOCOL.md`. Multi-project mode prefixes routes by project. |
| `index.html` | The whole UI: one vanilla HTML/JS file, no build step. Screens are specified in `design/*.md`. |
| `queue.js` | Pure selection rule (PROTOCOL §3) and the story ready queue. Loaded by the UI and required by the CLIs, so both compute the same answer. |
| `doctor.js` | Pure invariant checks over the five resources. Shared by the UI and `doctor-cli.js`. |
| `board-cli.js` | Terminal `next`, `status` and the `new` scaffold. Never edits existing board data. |
| `mcp-server.js` | Stdio MCP server: status/next plus claim, move, release, needs-human and propose-idea tools, for agents without the Claude Code skill. |
| `resolve.js` | Project lookup: registered name, literal directory, or `BOARD_DATA_DIR`. |
| `read-data.js` / `write-data.js` | One read path (defaults, wrapped shapes) and one write format (pretty JSON, trailing newline). |
| `defaults.js` | The five resource files and their empty defaults. |
| `data/` | Example defaults a new project is scaffolded from — not a live board. |
| `roadmap/` | This checkout's own live board (gitignored). |
| `.claude/skills/agent-board/` | The Claude Code skill that operates boards by editing JSON directly. |

## Invariants

- **The JSON files are the backlog.** Servers and CLIs are lenses; agents
  may edit the files with nothing running.
- **Git is the only persistence.** A commit in the project's context repo
  is the human ratifying the working state; the tool never commits.
- **Zero dependencies.** Node 18+ standard library only.
- **One rule, one module.** Selection lives in `queue.js` and invariants in
  `doctor.js`, shared by every front end.
- **Vocabulary comes from each project's `config.json`.** No lane, theme,
  priority or milestone name is hardcoded.
- **Local only.** The server binds to 127.0.0.1 and makes no outbound calls.

## Not enforced

`./board doctor` validates board data, not directory layout. The project
layout is a written contract in
[`PROJECT-STRUCTURE.md`](../PROJECT-STRUCTURE.md); a layout validator is
*proposed* at most.
