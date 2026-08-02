# agent-board protocol

**Status:** v1
**Origin:** generalized from `chaim-app/chaim-system-design/roadmap/agent-kanban-mvp.md` — that
document designed this exact idea (a board any coding agent can read to
self-dispatch); this file is the project-agnostic version of it, for any
project's `epics.json`/`ideas.json`, not just Chaim's.

## 1. The problem

An agent (or a human) starting a work session on a project's backlog needs
to answer one question reliably: **what is the single best thing to pick up
right now?** Answering it by hand each time defeats the point of having a
board; answering it wrong is worse — starting work that's blocked, gated
closed, or already claimed wastes effort.

## 2. What the board is — and isn't

The board is not a second backlog. `epics.json` (and `ideas.json`) *are*
the backlog — the JSON files under a project's data directory are the
single source of truth for what the work is. The board app is a thin
**view and edit surface** over those files; an agent doesn't need the app
running at all — reading and writing the JSON files directly is equally
valid and is exactly what the app itself does under the hood.

## 3. The selection rule

A card (`epics.json` entry) is **pickable** when all of these hold:

1. its `column` is the first configured lane (`config.json`'s `lanes[0]`,
   "Backlog" by default) — not already in progress, not done;
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

The top of that ranking is "next." An empty selection (nothing pickable) is
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
4. **Work** the card. Stories, if used, live in `stories.json` keyed by
   `epic_id`; break work down there if it's useful, but the board itself is
   card-grained.
5. **Move** the card: to the last lane when done, or back to an earlier
   lane (clearing `claimed_by`/`claimed_at`) if it can't be finished — leave
   a note explaining why in the card's `notes` field.
6. **Update** `updated_at` on every write.

## 5. Concurrency

There is no server-side locking. If multiple agents (or an agent and a
human) might write concurrently:

- **Editing through the running `server.js`**: writes are whole-file
  overwrites processed one HTTP request at a time by a single Node process,
  so two requests handled by the *same* server instance don't corrupt the
  file — but there's no cross-process locking, so two agents editing the
  same file by hand at the same time (bypassing the server) can still race.
- **Editing the JSON files directly under version control**: claim safety
  comes from git. An agent claims a card by committing the change; if two
  agents claim the same card, the second commit conflicts (or silently
  overwrites, if commits aren't checked before pushing) — resolve by
  re-reading and re-selecting rather than assuming your claim held.
- For a single person plus their own coding agents (the expected use case),
  this is enough. It is not designed for unattended multi-agent swarms
  writing the same file concurrently without any coordination layer — that
  would need the "tiny service" option this design deliberately avoids (see
  `README.md`).

## 6. What this does *not* decide

- **Whether a gate is open** — that's `config.json`'s `open_gates`, set by
  a human, read but not decided by an agent following this protocol.
- **Story-level tracking** — optional, and out of the selection rule
  entirely; the rule operates on `epics.json` only.
- **Automatic conflict resolution** — see §5. Re-select on conflict; don't
  assume.
