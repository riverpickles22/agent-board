# DESIGN.md — the UX spec contract

**This directory is the source of truth for the UI**, the way
[`AGENTS.md`](../AGENTS.md) is the contract for the data. Each screen of
the app is described by a markdown spec an AI agent can interpret to build
and evolve `index.html` through conversation — and a human can read or
hand-edit in any text editor.

Specs are written **for an AI+human reader, not a parser**. There is no
DSL, no codegen, no build step. If a section would only exist for a
machine, delete it.

```
design/
├── DESIGN.md        # this contract: format, workflow, drift rules
├── system.md        # token names/roles + shared chrome (header, modal, toast…)
├── execution.md     # #/execution — kanban over epics (was #/board)
├── milestones.md    # #/milestones(/<id>) — narrative + deliverables roll-up
├── ideas.md         # #/ideas — status columns + capture
├── idea-detail.md   # #/ideas/<id> — the deep dive
├── history.md       # #/history — ratification history (git log as a page)
└── docs.md          # #/docs — CAPABILITIES.md rendered in the UI
```

## 1. Spec format

Every screen spec has this shape:

```markdown
---
screen: execution
route: "#/execution"
spec_state: matches-ui
---

# <Screen name> — <one-line essence>

<Purpose: one or two sentences.>

## Layout        ← fenced ASCII wireframe
## Components    ← table: Component | Anchor | Shows | Notes
## Interactions  ← trigger → behavior → data effect, one line each
## States        ← empty / filtered / error / motion variants
## Data          ← what parts of state + config drive the screen
## Open questions  ← optional, only when something is genuinely unsettled
```

**Frontmatter.** `spec_state` is the drift flag:
- `matches-ui` — the spec describes `index.html` as built.
- `ahead-of-ui` — the spec was edited for an approved change that hasn't
  been applied to `index.html` yet. Flip it the moment you edit a spec;
  flip it back only after the change is applied and verified.

**Layout.** One fenced block, box-drawing characters, **≤ 80 columns**.
Config-driven text renders as `{curly}` placeholders (`{view.title}`,
`{lane 1}`) — the same nothing-hardcoded rule the app follows. Wireframes
show structure and hierarchy, not pixels.

**Components.** The **Anchor** column is the tether between spec and code:
every row names a real DOM id (`#filters`), class (`.card`), or function
(`cardEl()`) in `index.html`. Anchors must grep — a spec anchor that
doesn't resolve in `index.html` is drift by definition.

**Interactions.** Data effects name the resource written, e.g.
`persistResource("stories", …)`. If an interaction writes nothing, say so.

**Styling.** Specs reference tokens **by name** (`--accent`, `--lane-4`);
values live only in `index.html`'s `:root`. [`system.md`](system.md) names
the tokens and their intent — never duplicate hex values into specs.

## 2. The Design workflow

How UI changes happen (the skill routes here on "change the UI",
"redesign …", "add X to a card", etc.):

1. **User describes a UX change** in conversation.
2. **Edit the spec only.** Read the screen's spec and the anchored region
   of `index.html`; update wireframe / components / interactions; set
   `spec_state: ahead-of-ui`. Show the user the change. A spec edit is
   the UI analogue of a `ready: false` story — cheap, reviewable, not yet
   built.
3. **User iterates** — including hand-editing the wireframe themselves.
4. **On explicit approval** ("apply it" / "build it"): edit `index.html`
   to match — vanilla JS in the file's existing style, tokens by name,
   vocabulary from config, no new dependencies, no build step.
5. **Verify** (§4), flip `spec_state: matches-ui`, summarize, stop.
6. **Commit only on the user's "save"/"ratify"**: spec + `index.html`
   **together in one commit** in this repo, message `Design: …` —
   distinct from `Board: …` data commits, never mixed with them.

Standing rule: **never change `index.html`'s UI without its spec, and
never leave a spec ahead of the UI without an approved change behind it.**
A UX *proposal* that isn't approved for build is an idea card on the
board, not a spec edit.

## 3. Drift rules

Three mechanisms, all cheap, no tooling:

1. **`spec_state`** — self-declared. An `ahead-of-ui` flag surviving
   across sessions is itself a finding: apply the change or revert the
   spec.
2. **Anchor grep** — every backticked anchor in every Components table
   must resolve in `index.html`. One Bash call:
   `grep -o '`[^`]*`' design/*.md` → check each against the file.
3. **Curation pass 6** (AGENTS.md §7, "Design drift") — on "curate": run
   the anchor grep, skim each screen's render function against its
   wireframe and interactions, check `spec_state` flags, report a table
   of drift with proposed fixes. The user picks the direction —
   spec-to-match-code or code-to-match-spec. Propose only; never silently
   rewrite either side.

## 4. Verification

After applying a change: syntax-check the inline script (extract the
`<script>` body, `node --check`), run `./board <name>`, exercise the
changed interaction, confirm the save indicator cycles saved → saving →
saved, and confirm no config vocabulary got hardcoded.

## 5. Non-goals

- No parseable DSL, no code generation.
- No component library, framework, or build step — `index.html` stays one
  hand-written vanilla file.
- No pixel specs; no color values outside `index.html`'s `:root`.
- No screenshots in the repo, no visual-regression tooling.
- No per-project spec forks — one spec set for the one codebase
  (AGENTS.md §3's never-fork rule extends here). Per-project differences
  stay in `config.json`.
