---
screen: docs
route: "#/docs"
spec_state: matches-ui
---

# Docs — the capabilities inventory, in the UI

Renders `CAPABILITIES.md` (fetched from the server's `/docs` route) as a
readable page, so a person browsing the board can see what the tool can
do without the repo or curl. Read-only; the file is the source of truth.

## Layout

Wikipedia-style: the article uses the full width, with a floating
(sticky) **Contents** panel on the right that tracks the section you're
reading.

```
├──────────────────────────────────────────────────────────────────────┤
│ agent-board — what it can do                    ┌ CONTENTS ────────┐ │
│ The medium-altitude view… As of {date}…         │ ▍What it is      │ │
│ ┌▍■ What it is ──────────────────────────────┐  │  The three pages │ │
│ │ A local, zero-dependency kanban system…    │  │  What an agent…  │ │
│ └────────────────────────────────────────────┘  │  The machinery…  │ │
│ ┌▍■ The three pages (in flow order…) ────────┐  │  HTTP surface    │ │
│ │ Ideas — the inbox…                         │  └──────(sticky)────┘ │
│ │ Milestones — the narrative…                │                       │
│ └────────────────────────────────────────────┘                       │
│ ────────────────────────────────                                     │
│ Maintenance rule… (footnote, outside the cards)                      │
├──────────────────────────────────────────────────────────────────────┤
```

Each `h2` opens a **section card** (`.dsec`): a panel with a colored
left bar, swatch, and heading tinted by a per-section accent cycling
through the lane palette (`--lane-0…5` via `--sc`) — the same identity
system the board's lanes use. Inside a card, paragraphs or bullets that
open with a bold lead term (`**Ideas** — …`, `**Operate** — …`) render
the term in the section's color (`.dterm`), and list markers match. A
`---` rule closes the cards; whatever follows (the maintenance rule) is
a plain full-width footnote.

## Components

| Component | Anchor | Shows | Notes |
|---|---|---|---|
| Docs tab | `#tabs` | 4th view tab, after the flow trio | via `PAGES` (`docs`) + `PAGE_LABELS` |
| Whole page | `renderDocs()` `#view-docs` | grid: article + Contents panel (`docsMarkup()`) | scroll view; content fetched once per page load and cached (`docsHtml`) |
| Grid | `.docs-grid` | article left (full remaining width), TOC right (fixed 240px) | under 1100px: single column, Contents stacks on top (Wikipedia-mobile style) |
| Contents panel | `.toc` `wireDocsToc()` | "Contents" box listing every `h2` section; sticky while scrolling; active section highlighted (accent left bar) | scrollspy tracks `#view-docs` scroll; links are `data-target` + `scrollIntoView`, **never real `#` hrefs** — a raw hash would collide with the SPA router |
| Markdown renderer | `mdToHtml()` | headings (h1–h3, each with a slug `id`), paragraphs, `-` lists (with indented continuations), **bold**, *italics*, inline code, links, `---` rules | hand-rolled, escape-first (`esc()`); deliberately minimal — covers what CAPABILITIES.md uses, not general markdown |
| Section cards | `.dsec` | one panel per `h2` section: colored left bar + swatch + tinted heading, accent cycling `--lane-0…5` (`--sc` custom property) | `---` ends the card run; later content renders outside as a footnote |
| Lead terms | `.dterm` | the bold opener of a `**Term** — …` paragraph/bullet, tinted with the section accent | produced by post-processing `inline()` output; `li::marker` matches |
| Content styles | `.mdoc` | full-width article, token colors, code chips | values from `system.md` tokens only |

## Interactions

- Tab click → `#/docs` → fetch `/docs` (first visit only) → render;
  writes nothing. The page has no edit surface — edit CAPABILITIES.md
  in the repo (AGENTS.md §6 upkeep rule).
- Contents link click → smooth-scroll to that section (preventDefault;
  the URL hash never changes); writes nothing.
- Scrolling the view updates which Contents entry is highlighted.

## States

- Loading: dim "Loading…" placeholder until the fetch resolves.
- Fetch fails (e.g. the running server predates the `/docs` route):
  dim message telling the user to restart the board server; not cached,
  so a later visit retries.
- Narrow (<1100px): Contents becomes a static block above the article.

## Data

None of the board state — the only input is the `/docs` HTTP response
(`CAPABILITIES.md` verbatim). `docsHtml` caches the rendered result for
the session.
