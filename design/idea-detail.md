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
│ {Idea title}  (Status)(category)(prio) ★ quick win      [Edit core]  │
│ {description}                                                        │
│ ┌ CONTEXT — WHAT IS THIS  ─────────┐ ┌ DECISION LENS ═════════════╗  │
│ │ {context}                (edit)  │ ║ Effort ▾   Impact ▾        ║  │
│ └──────────────────────────────────┘ ║   ★ quick win — least work,║  │
│ ┌ PROS / CONS ─────────────(edit)─┐  ║     greatest impact        ║  │
│ │ Pros          │ Cons            │  ║ COMPOUNDING — WHAT DOORS   ║  │
│ │ • …           │ • …             │  ║ DOES THIS OPEN?     (edit) ║  │
│ └──────────────────────────────────┘ ╚════════════════════════════╝  │
│ ┌ REJECTED — WHY ──────────(edit)─┐  ┌ DEEP-DIVE SECTIONS ────────┐  │
│ │ (only when rejected)            │  │ {Section title}     (edit) │  │
│ └──────────────────────────────────┘ │ {body}                     │  │
│                                      │ [+ add section]            │  │
│                                      └────────────────────────────┘  │
│                                      ┌ BRAINSTORM LOG ────────────┐  │
│                                      │ 2026-08-02  note…          │  │
│                                      │ [Add a thought…    ] [Add] │  │
│                                      └────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────┤
```

(The lens block is double-bordered above to mark its accent border in
the real page — `.lens` gets the accent treatment because it *is* the
point of the page.)

## Components

| Component | Anchor | Shows | Notes |
|---|---|---|---|
| Whole page | `renderIdeaDetail()` | everything | rendered inside `#view-ideas` |
| Back | `#idd-back` | "← all ideas" | `navigate("ideas")` |
| Header | `.ihead` | title, status/category/priority pills, quick-win badge | pills from `system.md` vocabulary |
| Edit core | `#idd-edit` | button → `openIdea(id)` | same modal as the Ideas page |
| Context block | `.idd-block` | `context` or empty-state prompt | inline edit via `inlineEdit("context")` |
| Pros / cons | `.procon` | two lists, markers in `--lane-5`/`--lane-4` | edited as one-per-line textareas |
| Rejected block | — (`data-k="reject"`) | `rejected_reason` | only when rejected or a reason exists |
| Decision lens | `.lens` | effort ▾ (`#l-effort`), impact ▾ (`#l-impact`), quick-win verdict, compounding text | accent-bordered; levels — / low / medium / high (`EI_LEVELS`) |
| Sections | `.sec-item` `editSection()` | freeform title+body sections; "+ add section" (`#sec-add`) | holds UI sketches, market analysis, spikes… |
| Brainstorm log | `.idd-log` | dated entries, oldest first; add box (`#log-in` + `#log-add`) | **append-only** — no edit/delete on entries, by design |
| Inline editor | `inlineEdit()` | swaps a block's body for textarea + Save/Cancel | per-key: context / proscons / compounding / reject |

## Interactions

- Every inline save (context, pros/cons, compounding, reject, sections),
  lens select change, and log add → stamps `updated_at` (date only) and
  `persistResource("ideas", …)` via `saveIdeas()`, then re-renders the
  page.
- Log add: Enter in the input or the Add button; empty input is ignored.
- Section delete lives inside the section editor (Delete section).
- Cancel on any inline editor → re-render, nothing written.

## States

- Unknown id: "Idea not found" + link back to `#/ideas`.
- Empty blocks show italic prompts that teach the field ("Does building
  this make several later things cheaper? …").
- Quick win appears both as header badge and lens verdict when
  effort low + impact high.

## Data

One idea from `ideaById(id)`; `pros`/`cons`/`sections`/`log` normalized
to arrays on render. Dates via `today()` (YYYY-MM-DD). The log is the
record of how thinking evolved — never rewritten (AGENTS.md §2).
