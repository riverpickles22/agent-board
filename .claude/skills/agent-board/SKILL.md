---
name: agent-board
description: Read and update a project's kanban backlog (epics, stories, ideas) directly as JSON from Claude Code, without agent-board's local server running. Use whenever the user wants to know what to work on next, add/triage/reorder/reject an idea, move a card, or otherwise interact with a project's priority list the way agent-board's UI would.
---

# agent-board

`agent-board` is a standalone, zero-dependency local kanban tool (this
repo) that any project can point at its own data directory. This skill lets
Claude Code act on that data directly — reading and writing the same JSON
files the server and UI use — so a coding session can answer "what's next"
or triage the backlog without a browser open.

## 1. Locate the project's data directory

1. If `$BOARD_DATA_DIR` is set, use it.
2. Otherwise look for a `config.json` next to `epics.json`/`ideas.json` in
   the current project (common locations: a `roadmap/` folder, a
   `board/data/` folder — check the project's own README if unsure).
3. If genuinely ambiguous, ask the user which directory holds this
   project's board data.

## 2. Read the schema and protocol first

Read `<this repo>/README.md`'s "Schema" section and `<this
repo>/PROTOCOL.md` in full before making changes — they define the epic,
story, and idea shapes, the selection rule, and the claim/work/move loop.
Everything below assumes them.

## 3. Answering "what's next"

Apply `PROTOCOL.md` §3 literally: filter `epics.json` to cards in the first
lane, with every dependency in the last lane, with an open gate (`"none"`
or listed in `config.json`'s `open_gates`), not already `claimed_by`
someone else, and under any configured WIP limit. Rank survivors by
priority tier, then unblock count (how many other cards depend on it), then
file order. Report the top card — or, if nothing qualifies, say exactly why
(blocked, gated, claimed, or WIP-limited), since an empty selection is
information the user needs, not a failure to hide.

## 4. Claiming and moving a card

To claim: set `claimed_by` (an identifier for this session/agent) and
`claimed_at` (current ISO timestamp) on the card in `epics.json`, write the
file back. To move it: update `column`; clear `claimed_by`/`claimed_at`
when the card leaves your hands (done, or bounced back to an earlier lane).
Always bump `updated_at`. Respect the dependency-gating rule from
`PROTOCOL.md` §3 point 2 — don't move a card into the last lane while an
unmet dependency is still short of it.

## 5. Working the idea backlog

Ideas live in `ideas.json`, separate from `epics.json`. Status flows
`idea → considering → planned → building → done`, or `rejected` at any
point.

- **Adding an idea:** append an entry with `status: "idea"`, a priority
  guess, `created_at`/`updated_at` set to today.
- **Triaging:** move it along the status chain as it's discussed and
  decided.
- **Reordering:** move the entry within/between priority tiers — array
  order within a tier is the queue order.
- **Rejecting:** set `status: "rejected"` and fill `rejected_reason`. Don't
  delete the entry — the point is that "why we didn't do this" survives
  even though "when it was suggested" is no longer active.
- **Promoting:** when an idea is decided and ordered, create a
  corresponding `epics.json` entry (see the Epic schema) and either leave
  the idea as `status: "done"`/`"planned"` referencing it via a shared tag,
  or note the promotion in the idea's `notes`.

## 6. Writing the files

Whether the server is running or not, the files are the source of truth —
edit them directly with your file tools. If the server *is* running, it
will pick up your on-disk edit the next time its client reloads (it doesn't
watch the filesystem); no special coordination is needed for a single
session, but see `PROTOCOL.md` §5 if a human might be editing through the
UI at the same moment.
