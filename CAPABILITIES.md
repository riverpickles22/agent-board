# agent-board — what it can do

*The medium-altitude view, for humans and agents. As of 2026-08-09.
Served by the running board at `/docs` and `/llms.txt`. Details:
[README.md](README.md) (humans) · [AGENTS.md](AGENTS.md) +
[PROTOCOL.md](PROTOCOL.md) (agent contract — also served at `/AGENTS.md`
and `/PROTOCOL.md`) · [design/](design/DESIGN.md) (UI specs).*

**Agents: start at [AGENTS.md](AGENTS.md) §0** — a one-page orientation
(the five data files, the lifecycle, the five inviolable rules, where
depth lives). This document is the capability inventory; that one is the
contract.

## What it is

A local, zero-dependency kanban system shared by multiple projects. Each
project's backlog is plain JSON files in that project's own repo; **git is
the only persistence** (commit = the human ratifying the working state).
AI agents operate on the JSON files directly — the web UI
(`./board <name>` → localhost:4300) is a human lens, never a dependency.
Binds to 127.0.0.1 only.

## The five surfaces (in flow order: capture → intent → work → record)

**Ideas** — the funnel that decides what enters execution. *Ideas* asks
"what might this become"; *Execution* asks "what are we building". The
lifecycle runs **capture → back burner → front burner → review → ready
→ promote**, and each stage answers one of two questions: how much do
we believe in this, and is it defined enough to graduate? **Back
burner** is preserved but not worth design time; **front burner** is
being actively shaped; **ready for review** is shaped enough that only
a decision remains; **ready to implement** means intent is settled.

Colour is the maturity scale — gray dormant, blue shaping, amber
decision-required, green cleared — and it is the *only* colour on a
card, so the stage always reads at a glance. Cards grow as they mature
rather than being rewritten: a back-burner card is a title, a
one-sentence outcome and a bet; front burner adds why-now, **Opens**
(the inverse of dependencies, making architectural leverage visible)
and what it waits on; a review card leads with **Decision needed**; a
ready card states constraints and its acceptance boundary. Then
**⇥ Promote to Execution** creates the execution epic — the one recorded
moment an idea becomes committed work.

Cards drag between the active columns (and between burners, nudging
priority); the archive is not a drop target since rejecting requires a
reason. `done` and `rejected` live behind an archive toggle. Each idea
has a deep-dive page: context, pros/cons, a **decision lens** (effort ×
impact, quick-win flag, compounding), freeform sections, and an
append-only dated brainstorm log.

**Milestones** — the narrative. Per milestone: summary, user outcome,
gate/exit criteria, ROI, context docs, and **deliverables that roll up to
epic chips with live done-counts** (click a chip to jump to the card in
Execution). Optional architecture block showing subsystems as
new/changed/existing. ←/→ keys step through milestones.

**Execution** — committed work, and it answers four questions: *what
can an agent start now, what is running, what needs a human, what is
blocked.* One **work queue** answers "what now": `Ready to pick up · N`,
or `Agent working` naming the owner and how long ago they claimed it,
or why nothing is available. Claims show their age and turn amber past
48 hours, with a one-click release wherever they appear — a dead claim
otherwise removes real work from the queue silently. A **`needs`**
record on any card raises an amber "⚠ needs decision" with the question
on the card — the one state waiting on a person rather than on other
work. Completed work collapses (`✓ 4 done · view`, and a finished epic
folds to one line offering Ship & archive), and lane colour is
positional — gray queued, accent active, amber review, green done — so
any lane vocabulary works.

Under that: kanban over epics with drag-and-drop, a
**dependency guard** (a card can't enter the done lane before its deps;
deps can't leave while dependents are done) — human and agent see the
same answer to "what's next", because the queue renders the selection
rule the agent protocol uses. Filters by milestone/theme/tag with a
savable per-project default view.
A **Rows mode** toggle (Epics | Rows) switches the execution area to story
swimlanes: one row per epic, its stories as draggable cards across the
same lanes — stories move within their row, gated epics refuse drops,
and the preferred mode saves with the default view. Stories (buildable
slices with acceptance criteria and a human-set `ready` flag) also live
inside each epic's modal. Archiving hides, never deletes: a shipped
epic leaves the active board for the **Shipped** view while milestones
and dependencies still count it. The board's rules are visible, not just
enforced: WIP-limited lanes show board-wide `total/limit` counts that
go red when over, and closed-gate cards wear a `⛔` chip naming their
gate in both modes — advisory (drops are never blocked; the agent
protocol enforces). Each epic's modal renders its `context_docs` as
read-only chips that copy their path on click — the reading list is
visible where the human reviews the card, while editing stays
file/skill-only. A **Ready queue** strip under Next up is the story
grain of the same rule — every story a human could hand to an agent
right now (`ready: true`, first lane, unclaimed, epic ungated with deps
done), grouped by epic: the "begin X" menu, visible. Story cards
narrate their own state from one rule — `⚙ cooking` / `testing` /
`tidying up` / `writing` / `wiring up` by kind while in flight,
`⚑ ready to check` / `results in` / `ready to read` / `wired — verify`
once the work reaches a review lane (`⚑ in review · who` when someone
holds it), `⛔ gated: X` or `⏳ waiting on Y` when blocked, `needs prep`
before the human's ready flag, and `✓ shipped` / `plated` / `in the
books` when done (or `✓ done · waiting on <sibling>` while the epic lags).

**History** — the record. The data dir's git log as a timeline page:
every ratification with date, message, and files touched; expanding an
entry shows that commit's card-level changes. And before the commit,
the header's **pending badge** counts uncommitted board changes — click
it for the **ratify review panel**: every pending change as a readable
statement ("B1 moved Backlog → Done", "ideas reordered"), grouped by
resource, live-updating as agents work. The panel reviews; the human
ratifies (say "save", or commit the data dir) — commit-=-ratify made
visible at both ends. Opening the board after time away starts with a
**briefing banner** — "Since you last looked: N changes · M stale
claims" — the ratified history since your last visit as the same
card-level statements, computed from a per-browser last-seen marker.
And everything is keyboard-reachable: **`/`** opens a fuzzy command
palette over every epic, story, and idea (Enter jumps straight to the
card), **`n`** captures a new idea from any page.

**Docs** — the self-description. A tab renders this document inside the
UI, so a person browsing the board sees the capabilities without the
repo or curl; agents get the same text at `/llms.txt`.

## What an agent can do (the Claude skill)

- **Operate** — answer "what's next?" via the selection rule (pickable =
  first lane + deps done + gate open + unclaimed + WIP under limit;
  ranked by priority → unblock count → file order); move/claim cards;
  triage ideas.
- **Groom** — brainstorm → one epic + stories with testable acceptance
  criteria; everything lands `ready: false` for human review.
- **Curate** — six propose-then-approve passes: group, enrich, workflow
  impact, milestone alignment, context-doc drift, **design drift**
  (UX specs vs the actual UI).
- **Develop an idea** — fill the deep-dive fields through conversation;
  judge by the decision lens; **self-move the idea to `ready for
  review`** when it's decision-ready (the one status an agent sets
  unprompted).
- **Build** — verify ready → claim → read the story/epic/context →
  implement in the code repo → test → verify each criterion → move the
  card. New **value drivers** get folded into the docs (including this
  file) in the same change.
- **Design** — change the UI itself, spec-first: edit the screen's
  markdown spec in `design/` (ASCII wireframe + anchored component
  tables), get approval, then make `index.html` match. Spec and UI
  always commit together.
- **Save** — git commits only on the human's explicit "save"/"ratify".

## The machinery underneath

- **Per-project vocabulary** — lanes, priorities, themes, milestones,
  gates, WIP limits all live in each project's `config.json`; nothing is
  hardcoded (lane semantics are positional: first = todo, last = done).
- **Gates and WIP limits** — a gate is opened by a human in config, never
  by an agent; both feed the selection rule and the Next-up strip.
- **UX-spec framework** — every screen is described in `design/*.md`;
  drift is detectable by flag (`spec_state`), anchor grep, and curation.
- **Zero-step setup and updates** — any `./board` run self-installs the
  Claude skill as a symlink; updates in this repo are live for new agent
  sessions with no copy step. `./board` lists projects, `./board <name>`
  serves one, `./board stop [port]` stops one (naming what it killed).
- **Ship and close** — `archived_at` on an epic means shipped and closed:
  it leaves the active board for the Shipped view but still counts for
  milestone roll-ups and dependencies. Only settable once the epic and
  every one of its stories are done; clearing it is the human's call.
- **Multi-project** — `projects.json` registers name → data dir; one
  codebase serves arc, chaim, and agent-board's own dogfood backlog.
- **Live reload** — the server watches the data dir and pushes change
  events to every open page, which refetches and re-renders. Agent edits
  to the JSON appear in an open browser within a second; no manual
  reload, and the page no longer clobbers file edits with stale state.
  (Refreshes wait politely while a modal, drag, or save is in flight.)
  And changes **move**: an agent's edit doesn't snap in — the card
  visibly lifts, glides to its new lane or position, and sets down;
  in-place edits pulse a ring, new cards fade in. Watching an agent
  work looks like watching someone at a physical board.

## HTTP surface (the running site)

`GET /` (the UI) · `GET /api/board` (full board JSON) ·
`PUT /api/<epics|stories|ideas|config|milestones>` (whole-file write) ·
`GET /api/events` (SSE change feed — powers live reload) ·
`GET /api/pending` (uncommitted changes vs HEAD as card-level
statements — powers the ratify review panel) ·
`GET /api/history` + `GET /api/history/<hash>` (the data dir's commit
log, and one commit's card-level changes — powers the History page) ·
`GET /api/since/<hash>` (changes between an earlier commit and HEAD —
powers the briefing banner) ·
`GET /docs` + `GET /llms.txt` (this document) ·
`GET /AGENTS.md` + `GET /PROTOCOL.md` (the agent contract, so a client
holding only the URL can read the rules it must follow). The three
git-backed routes read git only (`execFile`, no shell) and degrade
gracefully when the data dir isn't a repo yet.

---

*Maintenance rule (AGENTS.md §6): any medium-or-larger capability change —
new UI surface, workflow, route, or status semantic — updates this file
in the same change, at this altitude: what it does, not how.*
