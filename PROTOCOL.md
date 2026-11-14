# agent-board protocol

**Status:** v1
**Origin:** generalized from one project's in-repo design note for an
agent-readable kanban — that document designed this exact idea (a board any
coding agent can read to self-dispatch); this file is the project-agnostic
version of it, for any project's `epics.json`/`ideas.json`.

## 1. The problem

An agent (or a human) starting a work session on a project's backlog needs
to answer one question reliably: **what is the single best thing to pick up
right now?** Answering it by hand each time defeats the point of having a
board; answering it wrong is worse — starting work that's blocked, gated
closed, or already claimed wastes effort.

## 2. What the board is — and isn't

All projects use the context and backlog layout in
[`PROJECT-STRUCTURE.md`](PROJECT-STRUCTURE.md). Design and strategy explain
the work; the five JSON files in `roadmap/` record its live state. Historical
CSVs and prose lists are not separate queues to synchronize.

The board is not a second backlog. `epics.json` (and `ideas.json`) *are*
the backlog — the JSON files under a project's data directory are the
single source of truth for what the work is. The board app is a thin
**view and edit surface** over those files; an agent doesn't need the app
running at all — reading and writing the JSON files directly is equally
valid and is exactly what the app itself does under the hood.

## 3. The selection rule

A card (`epics.json` entry) is **pickable** when all of these hold:

0. it is not **archived** — an epic carrying `archived_at` has shipped and
   been closed (AGENTS.md §2); it and its stories are out of the selection
   set entirely, though they still count for milestone roll-ups and as
   dependency targets. In practice archiving requires everything already
   done, so this rarely bites — state it anyway, and never report an
   archived card as available work;
1. its `column` is the first configured lane (`config.json`'s `lanes[0]`,
   "Ready" by default) — not already in progress, not done;
2. every id in its `deps` is a card whose `column` is the **last**
   configured lane (`lanes[lanes.length-1]`, "Done" by default);
3. its `gate` is `"none"`, or it appears in `config.json`'s `open_gates`
   array — whether a gate is open is a human judgment recorded there, not
   something an agent decides for itself;
4. it is not already `claimed_by` someone else;
5. the lane it would move into (the first lane's "in progress" successor —
   in practice, wherever the agent's own workflow lane is) is under any
   `wip_limits` configured for that lane, if a limit is set.

Among pickable cards, rank by:

1. **priority** — position in `config.json`'s `priorities` array, earliest
   first (default `Now > Next > Later > Someday`);
2. **unblock count** — how many other cards list this one in `deps` (do the
   things that free up the most downstream work first);
3. **file order** — the card's position in `epics.json`, as the final,
   deterministic tiebreak.

The top of that ranking is "next." `./board next <project>` prints this
computation (story grain first, this epic grain as the fallback), from the
same module the board UI renders — compute it by hand only when the CLI
is unavailable. An empty selection (nothing pickable) is
information, not a failure — report why: everything's blocked on a
dependency, gated closed, already claimed, or the lane is at its WIP limit.

**Stories** (`stories.json`) follow the same rule with two additions: a
story is pickable only if `ready: true` (the human's recorded judgment that
it has enough context to build — an agent never flips this on its own
initiative), and only if its parent epic's gate is open. Rank ready stories
by their own priority, then their epic's rank.

## 4. The agent protocol

1. **Read** `epics.json` and `config.json` (and `ideas.json` if triaging
   ideas rather than working cards).
2. **Select** the next pickable card by the rule above.
3. **Claim** it: set `claimed_by` (an agent/session identifier) and
   `claimed_at` (an ISO timestamp) on that card, and write the file back.
   This is the one write that should be atomic — see §5.
4. **Work** the card. Decompose approved work into stories in `stories.json`,
   keyed by `epic_id`, before implementation. Build human-approved ready
   stories one at a time. Lane position is live status: make each move at the
   moment it happens (claim before starting, done when verified), not
   retrospectively at the end of a session — an open board page
   live-reloads, so the human is watching the cards move.
5. **Move** the card: to the last lane when done, or back to an earlier
   lane (clearing `claimed_by`/`claimed_at`) if it can't be finished — leave
   a note explaining why in the card's `notes` field.
6. **Update** `updated_at` on every write.
7. **Release** your claim whenever you stop working a card — finished or
   not. A claim outliving its session hides real work from step 2 for
   everyone who comes after.

## 5. Concurrency

There is no server-side locking. If multiple agents (or an agent and a
human) might write concurrently:

- **Editing through the running `server.js`**: every write is a
  whole-file write, and every write is **conditional**. `GET /api/board`
  returns a `revisions` map (a hash of each file's bytes); a `PUT
  /api/<resource>` must send the revision it was based on in `If-Match`,
  and the server answers `409` and writes nothing when the file has
  changed since — or when no revision is sent at all. A successful `PUT`
  returns the new revision. Files are written to a temp file and renamed
  into place, so a reader never sees half a file. There is still no
  cross-process locking: two agents editing the same file by hand at the
  same time (bypassing the server) can race.
- **Editing JSON directly**: claiming is a working-tree edit, never an
  automatic commit. Git does not lock concurrent working-tree writes.
  Re-read before writing, preserve unrelated edits, coordinate writers,
  and re-read the result to check the claim. On conflict, re-select rather
  than assume ownership. Commit only when the user explicitly requests it.
- **An open browser page is a writer, and it merges rather than
  overwrites.** The server watches the data dir and pushes changes over
  SSE (`/api/events`); the page re-renders from fresh state, except while
  the human is mid-edit (a modal open, a drag, an inline editor on the
  idea deep dive) — that is when your edits and theirs overlap. Their save
  then gets a `409`, and the page refetches, re-applies only the records
  the human changed (by id, field by field, against what it had loaded),
  and writes again, with a toast saying it merged. Records you changed and
  the human did not survive; where both of you changed the same field of
  the same record, **the human's value wins** and the toast names the
  card. So a direct edit made while a page is open is safe unless the
  human is editing that very field — re-read after the human saves if it
  matters.
- **`mcp-server.js`'s write tools** (`claim`, `move`, `release`,
  `needs-human`, `propose-idea`) do their own direct read-modify-write file
  I/O, the same as an agent editing JSON by hand — no locking, no revision
  check. Each MCP client process is one more potential writer with the
  same race profile as any other direct edit; the answer is the same one
  as above: re-read and re-select on conflict, don't assume a write held.
  This is, honestly, a step toward the "unattended multi-agent swarm"
  scenario the next bullet says this design doesn't handle — it's still
  fine for one person's own agents claiming distinct cards, less fine for
  several agents racing to claim the *same* card at the same instant.
- For a single person plus their own coding agents (the expected use case),
  this is enough. It is not designed for unattended multi-agent swarms
  writing the same file concurrently without any coordination layer — that
  would need the "tiny service" option this design deliberately avoids (see
  `README.md`).

## 6. What this does *not* decide

- **Whether a gate is open** — that's `config.json`'s `open_gates`, set by
  a human, read but not decided by an agent following this protocol.
- **Whether a story is ready** — the human records that decision with
  `ready: true`. Story selection is defined in §3; decomposition and the
  build loop are required by `AGENTS.md` §§5–6.
- **Automatic conflict resolution** — see §5. Re-select on conflict; don't
  assume.
