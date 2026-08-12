---
name: agent-board
description: Work a project's agent-board backlog (ideas, epics, stories, milestones) directly as JSON — no server needed. Use when the user wants to know what to work on next, capture or triage ideas, brainstorm and break a feature request down into an epic with stories and acceptance criteria, clean up / curate the backlog, lay out or update milestone deliverables, move/claim cards, save the board to git, build a story they've declared ready ("begin X"), or change the board's own UI/UX ("change the UI", "redesign the ideas page", "add X to a card" — the Design workflow over design/*.md specs). Projects today: arc, chaim, board (the tool's own backlog).
---

# agent-board

agent-board is a local kanban system: one shared codebase
(`~/workspace/agent-board`), per-project JSON data directories, git as the
only versioning. You operate on the JSON files directly — the web UI is a
human lens, not a dependency.

## 1. Read the contract first

**Start with `<agent-board>/AGENTS.md` §0 (Orientation)** — one page that
maps the whole tool: the five data files, the lifecycle, the five
inviolable rules, and where every detail lives. Read it before touching
data; it tells you which of the deeper sections you actually need
(schemas §2, edit rules §3, git §4, grooming §5, build §6, curation §7).
`<agent-board>/PROTOCOL.md` holds the selection rule and claim loop —
read it before picking up work. For the capability inventory (or to
answer "what does agent-board do?"), read
`<agent-board>/CAPABILITIES.md`. A running board serves all three:
`/llms.txt` + `/docs` (capabilities), `/AGENTS.md`, `/PROTOCOL.md`.

**What the board can do for you today** (so you can offer it, not
rediscover it): the **Next-up strip** and **Ready queue** render the
selection rule for epics and stories, so the human sees the same "what's
next" you compute · **WIP limits and closed gates are visible** on lanes
and cards (advisory — enforcement is still yours, PROTOCOL §3) ·
**pending badge + ratify panel** show every uncommitted change as
card-level statements before the human says "save" · the **History**
page and **briefing banner** answer "what shipped" and "what changed
since I last looked" from git · **Remove from board** closes a finished
epic off the active board into the Shipped view (`archived_at`) —
propose it during curation when an epic is fully done · story cards
narrate their own state (`cooking`, `testing` in flight, `⚑ ready to
check` / `⚑ in review · who` in a review lane, `⛔ gated: X`,
`⏳ waiting on Y`, `✓ shipped`) · the human has `/` (find any card) and
`n` (capture an idea) anywhere.

The project's **context directory** is the `*-system-design` repo holding
the data dir — architecture/strategy/PRFAQ docs live there, and every
`context_docs` path resolves relative to its root. Read the docs a card
links before building or enriching it.

Find the agent-board checkout: `~/workspace/agent-board`, or wherever
`projects.json` + `AGENTS.md` + `server.js` live together.

## 2. Locate the project's board

1. `BOARD_DATA_DIR` env var, if set.
2. `<agent-board>/projects.json` — match by the repo you're working in
   (e.g. cwd under `…/arc/…` → project `arc`).
3. A directory in the current project holding `epics.json` beside
   `config.json`.
4. Ask.

## 3. Workflows

**Operate.** "What's next?" → apply PROTOCOL §3 literally and show your
ranking, naming the milestone each pick serves; an empty result is an
answer (say why). Move/claim/edit cards and triage ideas per AGENTS.md §3.
Respect dependency ordering and gates — gates are opened by humans in
`config.json`, never by you. Milestone deliverables live in
`milestones.json`; when the user asks "where are we on M1?", answer from
its deliverables' epic roll-up, not vibes.

**Check** ("is the board healthy?", after any grooming or curation pass).
`./board doctor <project>` — or read `doctor.js` and apply `diagnose()` to
the loaded files. Errors are contract violations; warnings are advice.
Report what it found; never repair silently.

**Curate** ("clean up the backlog", "tidy the board"). AGENTS.md §7, all
five passes: group related/misfiled work, enrich thin cards (what the
change is, `systems` involved, what to read), add `Workflow impact:` notes
where flows change, re-align milestones with their epics, and check
whether Done work has drifted from the architecture/strategy docs —
propose doc updates, never silently edit them. Everything lands as
proposals the user approves.

**Groom** (brainstorm → epic + stories). Talk first, write later. On
"break it down": one epic (propose theme + milestone from config vocab) +
stories with testable `acceptance_criteria`, `context` naming what a
builder must read, honest `kind` (integration testing that outgrows a
feature story is its own `integration` story). Everything lands
`ready: false`; summarize and stop — the user reviews, flips `ready`,
decides when to commit. Full rules: AGENTS.md §5.

**Develop an idea** (brainstorm before it's work). Ideas can be anything —
features, technologies, business moves. As the conversation lands things,
capture them into the idea's deep-dive fields (`context`, `pros`/`cons`,
`effort`/`impact`, `compounding`, `sections`, a dated `log` entry) so the
board page reflects the brainstorm. Judge by the decision lens (AGENTS.md
§2): least work × greatest impact; compounding infrastructure counts
double; simplest design wins ties. Before promoting, an idea needs a
`validation` plan — how the change would be checked. The UI refuses
without one and so should you, even when editing the JSON directly.
**When the deep dive is full enough
for the human to decide, move the idea to `ready for review` yourself**
with a dated `log` entry saying what made it decision-ready — that
status is your hand-off; it's the one transition you make unprompted
(AGENTS.md §2). `ready to implement` (the thumbs-up) and `rejected`
stay the human's call. From "ready to implement": **decompose before
building** — groom the idea into an epic + stories on the board backlog
(even a small ad hoc request gets a lightweight epic with one story),
then build card by card; milestone optional; mark the idea `done` when
it ships.

**Build** ("begin O1-2" / "begin epic O1"). Verify `ready` (the user
saying it's ready in-conversation counts — record it), claim, read the
story + epic + `context` + the target repo's own CLAUDE/AGENTS conventions,
implement in the code repo, write the tests the acceptance criteria call
for, run the project's checks, verify each criterion and report, move the
card. **Move cards in real time**: in-progress lane before you write
code, done lane the moment criteria verify — the live-reloading board
is the human's progress view, so never batch moves at session end. If
the request traces to a `ready to implement` idea, decompose it into an
epic + stories first and work those cards — never build straight off
the idea card. If the work created a **new value driver** — a capability,
convention, or workflow future agents should use — fold it into the
contract docs (AGENTS.md, this skill, PROTOCOL.md, `design/` specs) in
the same change; medium-or-larger capability changes also update
`CAPABILITIES.md` (AGENTS.md §6). Full loop: AGENTS.md §6.

**Design** ("change the UI", "redesign the ideas page", "add X to a
card"). The UI's source of truth is `<agent-board>/design/*.md`
(contract: `design/DESIGN.md` — read it first). Loop: read the screen's
spec → discuss and edit the **spec** (wireframe, components table,
interactions), setting `spec_state: ahead-of-ui` → the user approves →
apply the change to `index.html` matching its existing style (vanilla
JS, tokens by name per `design/system.md`, vocabulary from config —
nothing hardcoded) → verify against the running board → flip back to
`spec_state: matches-ui`. Spec and `index.html` commit **together** in
the agent-board repo (`Design: …` message) — never one without the
other, never mixed with `Board:` data commits. Never edit the UI
without touching its spec. An unapproved UX proposal is an idea card,
not a spec edit.

**Save.** Board edits are free; git commits happen when the user says
"save"/"commit"/"ratify" — commit the *project's* data repo with a
`Board: …` message. Code commits are separate, in the code repo, under its
rules. Never mix them.

## 4. Running the UI for the user

One server can serve every registered project at once: `node server.js`
then `/arc/#/board`, `/board/#/ideas`, with a switcher in the header.
`BOARD_DATA_DIR` still pins a single board and leaves its routes unprefixed
— that contract is unchanged.

If the user wants to see the board: `cd <agent-board> && ./board <name>` →
http://localhost:4300 (`PORT=4301` for a second board). If the page is open
while you edit JSON, a current server live-reloads it — your edits show
up in the browser on their own, animated so the human can watch cards
move. Only an older server (no `/api/events`) still needs the "please
reload" warning (AGENTS.md §3).

**Port already in use** means a board is already running there — usually
the one the user wants. Don't start a second copy by reflex: either use
it as-is, stop it with `./board stop [port]` (reports what it killed),
or run alongside on `PORT=4301`. `./board` with no arguments lists
registered projects; `./board setup` (re)installs this skill's symlink.

When reporting which board you're operating on, use its
`config.view.title` (e.g. "Chaim Build Board"), not just the project key.
`config.view` also holds the default page/milestone/theme applied on open
— update it when the user asks for a different default view, never as a
side effect. First-run on a new machine: `./board setup` installs this
skill's user-level symlink if it doesn't already exist.
