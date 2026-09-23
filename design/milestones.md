---
screen: milestones
route: "#/milestones(/<id>)"
spec_state: matches-ui
---

# Milestones — the narrative and its roll-up

What each milestone accomplishes and how the board serves it: overview of
the system, a tab per milestone, narrative on the left, deliverables
rolled up to epic chips (and optional architecture state) on the right.

## Layout

```
├──────────────────────────────────────────────────────────────────────┤
│ ┌ THE SYSTEM WE'RE BUILDING ──────────────┬─ CONTEXT DOCS ─────────┐ │
│ │ {overview.summary}                      │ Label path — note      │ │
│ └─────────────────────────────────────────┴────────────────────────┘ │
│ [{M0} name] [{M1} name] [{M2} name] …                     ms tabs    │
│                                                                      │
│ {milestone name}                                                     │
│ {tagline}                                                            │
│ ┌ narrative ────────────────┐  ┌ DELIVERABLES → BOARD ────────────┐  │
│ │ WHAT WE SEEK TO ACCOMPLISH│  │ Deliverable name        2/3 done │  │
│ │ {summary}                 │  │ description                      │  │
│ │ USER OUTCOME {…}          │  │ (F1 ✓)(F2)(F9)      epic chips   │  │
│ │ ┌ GATE/EXIT ────────────┐ │  └──────────────────────────────────┘  │
│ │ │ {gate}                │ │  ┌ SYSTEM DESIGN AT END OF {M0} ────┐  │
│ │ └───────────────────────┘ │  │ {architecture.summary}           │  │
│ │ ┌ ROI ──────────────────┐ │  │ [new] subsystem — note           │  │
│ │ │ {roi}                 │ │  │ [changed] subsystem — note       │  │
│ │ └───────────────────────┘ │  │                                  │  │
│ │ CONTEXT DOCS {…}          │  │                                  │  │
│ └───────────────────────────┘  └──────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────┤
```

## Components

| Component | Anchor | Shows | Notes |
|---|---|---|---|
| Whole page | `renderMilestones()` `#view-milestones` | everything below | scroll view; re-rendered per route param |
| Overview block | `.ov-block` `.ov-grid` | `overview.summary` + its context docs | only when `overview` present |
| Context docs | `ctxDocs()` `.ctxdoc` | label + mono path + note rows | used by overview and per-milestone |
| Milestone tabs | `.ms-nav` `.ms-tab` | `short(id)` + name per milestone | `aria-selected` on the active one |
| Auto-selection | `currentMilestone()` | — | earliest milestone (file order) whose mapped epics aren't all done; else first |
| Narrative column | `.ms-section` `.ms-meta` | summary, user outcome, gate/ROI boxes, context docs | optional fields render only when present; the gate and ROI boxes stack full-width under the summary (gate first) rather than sitting side by side |
| Deliverable | `.deliv` | name + "done/total done" + description + epic chips | roll-up counts epics in the done lane |
| Epic chip | `.chip-epic` | epic id, ✓ + `done` style when done | unknown id → `.missing` (dimmed, inert, titled "no epic with this id on the board") |
| Architecture | `.arch-sub` `.state` | subsystem rows with `new` / `changed` / `existing` badge | state colors: `--lane-5` / `--lane-2` / `--ink-3` |
| Jump to board | `goToEpic()` | — | sets board filters to the epic's milestone, navigates, scrolls + flashes the card |

| Progress bar | `progressBar()` `laneBuckets()` `.mbar` | a stacked bar under the milestone header — done / in flight / not started — with an "N of M epics done" label; the same bar in miniature on each deliverable row (`.mbar.mini`) | buckets by lane **position**, so it speaks the board's own colours on any lane vocabulary (green done, accent active, gray queued). Counts **epics** — the unit deliverables already link — and **archived epics still count**, since archiving hides but never deletes and a finished milestone must not read empty. Absent entirely when a milestone maps no epics: no zero bars |

## Interactions

- Milestone tab click → `navigate("milestones", id)`; writes nothing.
- ←/→ keys → previous/next milestone (document-level handler; skipped
  while typing in a field or while the modal is open); writes nothing.
- Epic chip click → `goToEpic(id)` — leaves this page for the board;
  writes nothing.
- The page has no editing surface — milestones are edited via file/skill
  only (AGENTS.md §2).

## States

- No milestones: overview (if any) + "No milestones yet — add them to
  milestones.json … or ask Claude to lay them out from your roadmap."
- Deliverable with no mapped epics: "No deliverables mapped to epics
  yet." placeholder inside the section.
- Bad route param: falls back to `currentMilestone()` selection (`msSel`).

## Data

`state.milestones` = `{ overview, milestones[] }` (array-form legacy data
normalized in `load()`). Roll-ups read `state.epics` via
`epicsOfMilestone()` (union of deliverable `epics` ids) and `doneLane()`.
Milestone `id`s are the *short* form of config vocab entries (AGENTS.md
§2); `short()` renders tab ids.
