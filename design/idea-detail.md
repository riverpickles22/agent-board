---
screen: idea-detail
route: "#/ideas/<id>"
spec_state: matches-ui
---

# Idea deep dive — does this idea deserve development?

One idea's full case: context, pros/cons, the decision lens (effort ×
impact × compounding), freeform sections, and an append-only brainstorm
log. Every block edits inline; the page is where an idea is developed
until a decision lands.

## Layout

```
├──────────────────────────────────────────────────────────────────────┤
│ ← all ideas                                                          │
│ {Idea title}  ★ quick win                               [Edit core]  │
│ ●─Idea──●─Ready for review──○─Ready to implement   (Done)/(Rejected) │
│ priority (Next) category (feature) milestone ({M0}) (tag)            │
│ ⊸ depends on idea-x idea-y            created {d} · updated {d}      │
│ {plain description, ≤72ch}           ┌ TECHNICAL SHAPE (recessed) ┐  │
│ (business/why half, top of the      │ {technical description}    │  │
│  left column)                        └────────────────────────────┘  │
│ ┌ CONTEXT — WHAT IS THIS  ─────────┐ ┌ DECISION LENS ═════════════╗  │
│ │ {context}                (edit)  │ ║ Effort [—|low|med|high]    ║  │
│ └──────────────────────────────────┘ ║ Impact [—|low|med|high]    ║  │
│ ┌ PROS / CONS ─────────────(edit)─┐  ║ {verdict: ★ quick win /    ║  │
│ │ Pros          │ Cons            │  ║  e · i readback / prompt}  ║  │
│ │ • …           │ • …             │  ║ COMPOUNDING — WHAT DOORS   ║  │
│ └──────────────────────────────────┘ ║ DOES THIS OPEN?     (edit) ║  │
│ ┌ REJECTED — WHY ──────────(edit)─┐  ╚════════════════════════════╝  │
│ │ (only when rejected)            │  ┌ DEEP-DIVE SECTIONS ────────┐  │
│ └──────────────────────────────────┘ │ {Section title}     (edit) │  │
│                                      │ {body}   [+ add section]   │  │
│                                      └────────────────────────────┘  │
│                                      BRAINSTORM LOG   (borderless)   │
│                                      2026-08-02  note…               │
│                                      [Add a thought…       ] [Add]   │
├──────────────────────────────────────────────────────────────────────┤
```

(The lens block is double-bordered above to mark its accent border in
the real page — `.lens` gets the accent treatment and is deliberately
the *only* emphasized box: Technical shape is recessed reference, the
log is a borderless journal, everything else is the standard panel.)

## Components

| Component | Anchor | Shows | Notes |
|---|---|---|---|
| Whole page | `renderIdeaDetail()` | everything | rendered inside `#view-ideas` |
| Back | `#idd-back` | "← all ideas" | `navigate("ideas")` |
| Header | `.ihead` | title + quick-win badge + Edit core | status/category/priority moved out of the title row — see stepper + meta row |
| Lifecycle stepper | `lifecycleEl()` `.steps` | the three-status pipeline as connected nodes: passed = filled, current = filled + accent ring, future = dim | terminal states: `done` fills all + a `--lane-5` chip (`.term.tdone`); `rejected` dims the steps (`.steps.rej`) + a `--lane-4` chip (`.term.trej`) |
| Meta row | `metaRowEl()` `.imeta-row` | labeled micro-pills: priority, category, milestone (`short()`, full in title), theme, tags; `⊸ depends on` links; dim created/updated dates right | dep ids that are ideas render as `.dep-l` buttons (`data-goidea`) navigating to that idea; non-idea ids (epics) render inert (`.dep-x`) |
| Description split | `descParts()` `.dplain` `.dtech` | plain-language description tops the left column, "Technical shape" box tops the right | splits on the `Technical shape:` paragraph convention; the halves live *inside* the `.idd-grid` columns so each side flows with no cross-column gap; descriptions without the marker render as one plain paragraph atop the left column |
| Edit core | `#idd-edit` | button → `openIdea(id)` | same modal as the Ideas page |
| Copy | `#idd-copy` `ideaMarkdown()` | "⧉ copy" beside Edit core — the idea's full case (description, meta, reasoning, context, pros/cons, compounding, sections, log) to the clipboard as markdown | for running the idea past another tool ("what are we missing?"); same conventions as the epic/ideas exports — id in backticks so answers can reference the card |
| Validation plan | the reasoning block's `Validation plan:` line | `validation` — how we would know this works | shown beside constraints and the acceptance boundary; from `ready to implement` an empty one renders as an explicit gap (`#idd-valid-gap`), because that is the stage where it blocks promotion. Edited in the core modal with the other reasoning fields |
| Context block | `.idd-block` | `context` or empty-state prompt | inline edit via `inlineEdit("context")` |
| Pros / cons | `.procon` | two lists, markers in `--lane-5`/`--lane-4` | edited as one-per-line textareas |
| Rejected block | — (`data-k="reject"`) | `rejected_reason` | only when rejected or a reason exists |
| Decision lens | `.lens` `.seg` | effort + impact as segmented controls (one button per `EI_LEVELS` value, current `aria-pressed`), always-present verdict line, compounding text | accent-bordered — the page's one emphasized box. Verdict states: ★ quick win when earned; "{effort} effort · {impact} impact" readback when both set (`.verdict.quiet`); teaching prompt otherwise (`.verdict.hint`) |
| Sections | `.sec-item` `editSection()` | freeform title+body sections; "+ add section" (`#sec-add`) | holds UI sketches, market analysis, spikes… |
| Brainstorm log | `.idd-block.loose` `.idd-log` | dated entries, oldest first; add box (`#log-in` + `#log-add`) | **append-only** — no edit/delete on entries, by design; rendered borderless (journal weight — hairline dividers carry the structure) |
| Technical shape | `.dtech` | the description's technical half | recessed surface (mixed toward `--ground`) — reference material, not a competing panel |
| Inline editor | `inlineEdit()` | swaps a block's body for textarea + Save/Cancel | per-key: context / proscons / compounding / reject |

| Editable in place | `inlineEdit()` `INLINE` `.eb` | **every prose region edits where it sits** — title (click it), description (tall textarea holding both halves), why-now/decision/conviction, context, compounding, pros/cons, deep-dive sections, rejected reason | each editor is sized for its content; Save writes + re-renders, Cancel restores, Escape leaves the title untouched. `Edit core` keeps only the small structured metadata (status, priority, category, milestone, theme, tags, deps, constraints, acceptance) — the fields a modal is actually good at |
| Lead description | `.idd-block.lead` `data-k="description"` | the plain half as lead prose, its edit affordance revealed on hover | borderless so it still reads as the opening paragraph rather than a form field |

## Interactions

- Every inline save (context, pros/cons, compounding, reject, sections),
  lens segment click, and log add → stamps `updated_at` (date only) and
  `persistResource("ideas", …)` via `saveIdeas()`, then re-renders the
  page.
- Lens segment click sets `effort`/`impact` in one click — the whole
  scale is visible, the current value filled.
- Dep link click (`data-goidea`) → `navigate("ideas", id)`; writes
  nothing.
- Log add: Enter in the input or the Add button; empty input is ignored.
- Copy (`#idd-copy`) → `ideaMarkdown(i)` to the clipboard + toast; writes
  nothing.
- Section delete lives inside the section editor (Delete section).
- Cancel on any inline editor → re-render, nothing written.

- Click the title → inline rename (Enter commits, Escape cancels, blur
  commits). Click any block's **edit** → that block becomes its editor.
- Prose fills its grid column: no character cap, with the page bounded
  at 1760px so ultrawide screens don't produce one enormous line.

## States

- Unknown id: "Idea not found" + link back to `#/ideas`.
- Reading measure: `.dplain` caps at 72ch, block paragraphs at 75ch —
  no 200-character lines on wide monitors.
- Keyboard: segments and dep links are buttons — Tab + Enter work;
  `:focus-visible` shows a 2px accent outline (global rule).
- Empty blocks show italic prompts that teach the field ("Does building
  this make several later things cheaper? …").
- Quick win appears both as header badge and lens verdict when
  effort low + impact high.

## Data

One idea from `ideaById(id)`; `pros`/`cons`/`sections`/`log` normalized
to arrays on render. Dates via `today()` (YYYY-MM-DD). The log is the
record of how thinking evolved — never rewritten (AGENTS.md §2).
