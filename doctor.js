/* Board doctor — the contract, checked.
 *
 * AGENTS.md states real invariants (ids are permanent, vocabulary comes from
 * config, a deliverable's epics must exist, `archived_at` only once every
 * story is done) and agents edit these files directly by design, so nothing
 * enforced them. A dangling deliverable link or a theme typo degrades the
 * milestone roll-up silently — and the roll-up is what a human trusts to
 * answer "where are we".
 *
 * One pure function over the five resources, no I/O and no dependencies, so
 * the same checks serve both callers with no chance of drift:
 *   - `./board doctor <project>` requires this file directly
 *   - the UI loads it as a <script> and renders the same findings in a panel
 *
 * It never repairs. Reporting is the whole job: the same stance gates take —
 * the tool is a lens, and the human or the agent decides what to do.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BoardDoctor = api;
})(typeof self !== "undefined" ? self : this, function () {

  // The stale-claim rule is queue.js's (B42-1): the browser has loaded it as
  // BoardQueue by the time diagnose() runs; node requires it.
  const queue = () => (typeof BoardQueue !== "undefined" ? BoardQueue : require("./queue.js"));
  const IDEA_STATUSES = ["idea", "ready for review", "ready to implement", "done", "rejected"];
  // The funnel renamed two stages once; a legacy value is not a data error.
  const IDEA_STATUS_LEGACY = { "exploring": "idea", "shaping": "ready for review" };

  const arr = v => Array.isArray(v) ? v : [];
  const str = v => typeof v === "string" ? v.trim() : "";

  // AGENTS.md §2/§6 step 8: closing an epic records the architecture check
  // as a notes line starting "Architecture:" (a list dash or bold allowed).
  // The page reads this same test for its Remove-from-board reminder.
  const ARCH_LINE = /^[ \t]*(?:[-*][ \t]+)?(?:\*\*)?Architecture:/m;
  const hasArchitectureLine = e => ARCH_LINE.test(str(e && e.notes));

  // AGENTS.md §2/§6 step 9: closing an epic records a code-health review as
  // a "Code health:" line — or, when a human closed it from the page, a
  // "Code health: review queued as <story id>" line until an agent builds it.
  const HEALTH_LINE = /^[ \t]*(?:[-*][ \t]+)?(?:\*\*)?Code health:/m;
  const QUEUED = /^[ \t]*(?:[-*][ \t]+)?(?:\*\*)?(?:Code health|Architecture):(?:\*\*)?[ \t]*review queued as[ \t]+([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)/gm;
  const hasCodeHealthLine = e => HEALTH_LINE.test(str(e && e.notes));
  // Every story id a queued Architecture: or Code health: line names.
  const queuedReviews = e => Array.from(new Set(Array.from(str(e && e.notes).matchAll(QUEUED), m => m[1])));
  // The standing epic that holds queued reviews: a queue, not shipped work,
  // so it stays in the first lane and is never offered for removal.
  const REVIEWS_TAG = "closing-reviews";
  const isReviewsEpic = e => arr(e && e.tags).includes(REVIEWS_TAG);
  // Epics archived on or before this date shipped before the rule existed.
  const HEALTH_SINCE = "2026-11-14";

  /**
   * @param {{config?:object, epics?:array, stories?:array, ideas?:array, milestones?:object}} data
   * @param {{now?:number}} [opts]  now is injectable so results are reproducible
   * @returns {Array<{severity:"error"|"warning", code:string, ids:string[], message:string}>}
   */
  function diagnose(data, opts) {
    const now = (opts && opts.now) || Date.now();
    const cfg = (data && data.config) || {};
    const epics = arr(data && data.epics);
    const stories = arr(data && data.stories);
    const ideas = arr(data && data.ideas);
    const msDoc = (data && data.milestones) || {};
    const milestones = Array.isArray(msDoc) ? msDoc : arr(msDoc.milestones);

    const lanes = arr(cfg.lanes);
    const firstLane = lanes[0];
    const doneLane = lanes[lanes.length - 1];
    const reviewLane = lanes.length > 3 ? lanes[lanes.length - 2] : null;   // same reading as the UI's reviewLane()
    const prios = arr(cfg.priorities);
    const themes = arr(cfg.themes);
    const msVocab = arr(cfg.milestones);

    const out = [];
    const add = (severity, code, ids, message) =>
      out.push({ severity, code, ids: arr(ids).filter(Boolean).map(String), message });
    const err = (code, ids, msg) => add("error", code, ids, msg);
    const warn = (code, ids, msg) => add("warning", code, ids, msg);

    const epicIds = new Set(epics.map(e => e && e.id).filter(Boolean));
    const storyIds = new Set(stories.map(s => s && s.id).filter(Boolean));
    const ideaIds = new Set(ideas.map(i => i && i.id).filter(Boolean));
    const epicById = Object.fromEntries(epics.filter(e => e && e.id).map(e => [e.id, e]));
    const storiesOf = id => stories.filter(s => s && s.epic_id === id);

    /* ---- ids: permanent, unique, present ---- */
    const dupes = (list, label) => {
      const seen = new Set(), dup = new Set();
      list.forEach(x => {
        const id = x && x.id;
        if (!id) return;
        if (seen.has(id)) dup.add(id); else seen.add(id);
      });
      dup.forEach(id => err("duplicate-id", [id], "duplicate " + label + " id — ids are permanent and unique (AGENTS.md §2)"));
    };
    dupes(epics, "epic"); dupes(stories, "story"); dupes(ideas, "idea");

    epics.forEach((e, ix) => { if (!e || !str(e.id)) err("missing-id", [], "epic at index " + ix + " has no id"); });
    stories.forEach((s, ix) => { if (!s || !str(s.id)) err("missing-id", [], "story at index " + ix + " has no id"); });
    ideas.forEach((i, ix) => { if (!i || !str(i.id)) err("missing-id", [], "idea at index " + ix + " has no id"); });

    /* ---- referential integrity: every pointer resolves ---- */
    stories.forEach(s => {
      if (!s || !s.id) return;
      if (!str(s.epic_id)) err("story-orphan", [s.id], "story has no epic_id");
      else if (!epicIds.has(s.epic_id)) err("story-orphan", [s.id, s.epic_id],
        "story names epic " + s.epic_id + " — no such epic");
    });

    epics.forEach(e => {
      if (!e || !e.id) return;
      arr(e.deps).forEach(d => {
        if (!epicIds.has(d)) err("dep-missing", [e.id, d],
          "epic depends on " + d + " — no such epic");
      });
    });

    ideas.forEach(i => {
      if (!i || !i.id) return;
      // An idea's deps are informational and may name an epic (AGENTS.md §2),
      // so an unresolvable one is worth saying but does not break a rule.
      arr(i.deps).forEach(d => {
        if (!ideaIds.has(d) && !epicIds.has(d)) warn("idea-dep-unknown", [i.id, d],
          "idea depends on " + d + " — matches no idea or epic");
      });
      if (str(i.promoted_to) && !epicIds.has(i.promoted_to))
        err("promoted-missing", [i.id, i.promoted_to],
          "idea was promoted to " + i.promoted_to + " — no such epic");
    });

    milestones.forEach(m => {
      if (!m) return;
      arr(m.deliverables).forEach(d => {
        arr(d && d.epics).forEach(eid => {
          if (!epicIds.has(eid)) err("deliverable-missing", [str(m.id), eid],
            "milestone " + str(m.id) + " deliverable \"" + str(d.name) + "\" links " + eid + " — no such epic");
        });
      });
    });

    // A live epic that carries a milestone the roll-up knows, but that no
    // deliverable links: the Board's milestone filter shows it and the
    // milestone's progress does not count it (B44). One warning per
    // milestone, naming the epics. A milestones.json id is the short form of
    // its config entry — the same match the UI's msMatches() makes.
    milestones.forEach(m => {
      const id = m && str(m.id);
      if (!id) return;
      const linked = new Set();
      arr(m.deliverables).forEach(d => arr(d && d.epics).forEach(eid => linked.add(eid)));
      if (!linked.size) return;                       // nothing rolled up yet — nothing to drift from
      const vocab = msVocab.find(v => v === id || String(v).startsWith(id + " "));
      if (!vocab) return;
      const loose = epics.filter(e => e && e.id && !e.archived_at && e.milestone === vocab && !linked.has(e.id)).map(e => e.id);
      if (loose.length) warn("milestone-no-deliverable", loose,
        (loose.length === 1 ? "epic carries" : loose.length + " epics carry") + " milestone \"" + vocab +
        "\" but no deliverable in milestones.json links " + (loose.length === 1 ? "it" : "them") +
        " — the milestone's progress does not count " + (loose.length === 1 ? "it" : "them"));
    });

    /* ---- vocabulary: config is the only source (AGENTS.md §2) ---- */
    const vocab = (x, kind, field, list) => {
      const v = str(x[field]);
      if (v && list.length && !list.includes(v))
        warn("vocab-" + field, [x.id], kind + " " + field + " \"" + v + "\" is not in config." +
          ({ milestone: "milestones", priority: "priorities", theme: "themes" }[field] || field) +
          (field === "priority" && kind !== "idea" ? " — it ranks after every known priority" : ""));
    };
    epics.forEach(e => { if (!e || !e.id) return;
      vocab(e, "epic", "theme", themes); vocab(e, "epic", "milestone", msVocab); vocab(e, "epic", "priority", prios); });
    ideas.forEach(i => { if (!i || !i.id) return;
      vocab(i, "idea", "theme", themes); vocab(i, "idea", "milestone", msVocab); vocab(i, "idea", "priority", prios); });
    stories.forEach(s => { if (!s || !s.id) return; vocab(s, "story", "priority", prios); });

    // A lane outside the config is different in kind: nothing renders the card,
    // and the selection and dependency rules key off lane position.
    const laneCheck = (x, kind) => {
      const c = str(x.column);
      if (!lanes.length) return;
      if (!c) err("lane-missing", [x.id], kind + " has no column");
      else if (!lanes.includes(c)) err("lane-unknown", [x.id],
        kind + " is in lane \"" + c + "\", which is not in config.lanes — it will not render");
    };
    epics.forEach(e => { if (e && e.id) laneCheck(e, "epic"); });
    stories.forEach(s => { if (s && s.id) laneCheck(s, "story"); });

    ideas.forEach(i => {
      if (!i || !i.id) return;
      const st = IDEA_STATUS_LEGACY[str(i.status)] || str(i.status);
      if (st && !IDEA_STATUSES.includes(st))
        err("idea-status", [i.id], "idea status \"" + i.status + "\" is not one of " + IDEA_STATUSES.join(" / "));
    });

    /* ---- lifecycle rules ---- */
    epics.forEach(e => {
      if (!e || !e.id || !doneLane) return;
      const st = storiesOf(e.id);
      // "an agent may set archived_at only when the epic *and every one of its
      // stories* sit in the done lane" (AGENTS.md §2)
      if (str(e.archived_at)) {
        const openStories = st.filter(s => s.column !== doneLane).map(s => s.id);
        if (e.column !== doneLane)
          err("archived-not-done", [e.id], "epic is archived but sits in " + e.column + ", not " + doneLane);
        if (openStories.length)
          err("archived-open-stories", [e.id].concat(openStories),
            "epic is archived but " + openStories.length + " of its stories " +
            (openStories.length === 1 ? "is" : "are") + " not " + doneLane + ": " + openStories.join(", "));
      }
      // the dependency guard, checked against the data rather than the drag
      if (e.column === doneLane) {
        const unmet = arr(e.deps).filter(d => epicById[d] && epicById[d].column !== doneLane);
        if (unmet.length) err("done-before-deps", [e.id].concat(unmet),
          "epic is in " + doneLane + " but depends on " + unmet.join(", ") + ", which " + (unmet.length === 1 ? "is" : "are") + " not");
      }
      if (str(e.gate) && e.gate !== "none" && !arr(cfg.open_gates).includes(e.gate) && e.column === doneLane)
        warn("done-while-gated", [e.id], "epic is done but its gate \"" + e.gate + "\" was never opened");
      if (firstLane && e.column === firstLane && !str(e.archived_at) && !st.length)
        warn("needs-grooming", [e.id], "epic is in " + firstLane + " with no stories — committed but not broken down (AGENTS.md §5)");
      if (st.length && st.every(s => s.column === doneLane) && e.column !== doneLane && !str(e.archived_at) && !isReviewsEpic(e))
        warn("stories-done-epic-behind", [e.id],
          "every story is " + doneLane + " but the epic card sits in " + e.column);
      // Ready to close out — every story in the review or done lane (a
      // story-less epic: its own card done) — or closed after the rule, with
      // no architecture review recorded or queued. The review is owed now:
      // dispatch the architecture reviewer on the latest changes (AGENTS.md
      // §6 step 8). Epics archived on or before HEALTH_SINCE are never flagged.
      const closing = st.length ? st.every(s => s.column === doneLane || (reviewLane && s.column === reviewLane))
                                : e.column === doneLane;
      const lateArchive = str(e.archived_at) && str(e.archived_at).slice(0, 10) > HEALTH_SINCE;
      if (!isReviewsEpic(e) && ((!str(e.archived_at) && closing) || lateArchive) && !hasArchitectureLine(e))
        warn("no-architecture-line", [e.id],
          "epic is " + (str(e.archived_at) ? "closed" : "ready to close out") + " but its notes carry no \"Architecture:\" line — the review is owed now: dispatch the architecture-reviewer on its latest changes and write the line it returns (AGENTS.md §6 step 8)");
      // Closed after the code-health rule landed with neither the review's
      // line nor a queued one (AGENTS.md §6 step 9).
      if (str(e.archived_at) && str(e.archived_at).slice(0, 10) > HEALTH_SINCE && !hasCodeHealthLine(e))
        warn("no-code-health", [e.id],
          "epic was archived with no \"Code health:\" line in its notes — review the code it changed for debt and record the result (AGENTS.md §6 step 9)");
      queuedReviews(e).filter(q => !stories.some(s => s && s.id === q)).forEach(q =>
        warn("closing-review-missing", [e.id, q],
          "notes say a closing review was queued as " + q + ", but no story " + q + " exists"));
    });

    stories.forEach(s => {
      if (!s || !s.id) return;
      if (s.ready === true && !arr(s.acceptance_criteria).length)
        warn("ready-no-criteria", [s.id], "story is marked ready but has no acceptance criteria (AGENTS.md §5)");
      if (reviewLane && s.column === reviewLane && !arr(s.how_to_test).length)
        warn("review-no-test-steps", [s.id], "story is in " + reviewLane + " with no how_to_test steps — the human has nothing to follow (AGENTS.md §6)");
      if (str(s.epic_id) && !new RegExp("^" + s.epic_id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "-\\d+$").test(s.id))
        warn("story-id-shape", [s.id], "story id does not follow <epic_id>-<n> (" + s.epic_id + "-n)");
      if (str(s.kind) && !["feature", "test", "integration", "chore", "docs"].includes(s.kind))
        warn("story-kind", [s.id], "story kind \"" + s.kind + "\" is not one of feature / test / integration / chore / docs");
    });

    /* ---- claims: suspect, never wrong (the board's own reading); a review
       lane waits on the human, so a claim there is never stale (B36) ---- */
    [].concat(epics, stories).forEach(x => {
      if (!x || !x.id || !x.claimed_by || x.column === doneLane || (reviewLane && x.column === reviewLane)) return;
      const at = Date.parse(x.claimed_at || "");
      if (isNaN(at)) { warn("claim-undated", [x.id], "claimed by " + x.claimed_by + " with no valid claimed_at"); return; }
      const days = Math.floor((now - at) / 86400000);
      if (queue().isStale(x, doneLane, now, reviewLane))
        warn("claim-stale", [x.id], "claimed by " + x.claimed_by + " " + days + "d ago and still in " + x.column + " (a claim in the review lane is the human's wait and is not checked)");
    });

    /* ---- validation plans (the promotion boundary) ---- */
    ideas.forEach(i => {
      if (!i || !i.id) return;
      const st = IDEA_STATUS_LEGACY[str(i.status)] || str(i.status);
      if (st === "ready to implement" && !str(i.validation) && !str(i.promoted_to))
        warn("idea-no-validation", [i.id], "idea is ready to implement but has no validation plan — promotion will refuse it");
    });
    epics.forEach(e => {
      if (!e || !e.id) return;
      const from = ideas.find(i => i && i.promoted_to === e.id);
      if (from && !str(e.test_plan))
        warn("epic-no-test-plan", [e.id, from.id], "epic was promoted from " + from.id + " but has no test_plan");
    });

    /* ---- the funnel's other end ---- */
    ideas.forEach(i => {
      if (!i || !i.id) return;
      const st = IDEA_STATUS_LEGACY[str(i.status)] || str(i.status);
      if (str(i.promoted_to) && st !== "done" && st !== "rejected")
        warn("promoted-still-open", [i.id, i.promoted_to],
          "idea became " + i.promoted_to + " but is still \"" + i.status + "\" in the funnel");
      if (st === "rejected" && !str(i.rejected_reason))
        warn("rejected-no-reason", [i.id], "idea is rejected with no rejected_reason (AGENTS.md §2)");
    });

    /* ---- rules the contract states (B40-3) ---- */
    const archivedCard = x => str(x.archived_at) || (x.epic_id && epicById[x.epic_id] && str(epicById[x.epic_id].archived_at));
    // the in-progress lanes: everything strictly between the first lane and
    // the review lane (or the done lane, on a board with no review lane)
    const workLanes = lanes.slice(1, reviewLane ? lanes.length - 2 : lanes.length - 1);
    [["epic", epics], ["story", stories]].forEach(([kind, list]) => list.forEach(x => {
      if (!x || !x.id) return;
      if (x.needs) {
        if (x.column === doneLane || archivedCard(x))
          warn("needs-on-closed", [x.id], kind + " carries `needs` but is " +
            (x.column === doneLane ? "in " + doneLane : "archived") + " — clear it once answered (AGENTS.md §2)");
        if (typeof x.needs !== "object" || Array.isArray(x.needs) || !str(x.needs.reason))
          warn("needs-shape", [x.id], kind + " `needs` should be { kind, reason } with a specific question as reason (AGENTS.md §2)");
      }
      if (archivedCard(x)) return;
      if (workLanes.includes(x.column) && !x.claimed_by &&
          !(kind === "epic" && storiesOf(x.id).some(s => s.claimed_by)))
        warn("in-progress-unclaimed", [x.id], kind + " is in " + x.column + " with no claim — nobody is recorded as working it (PROTOCOL.md §4)");
      if (firstLane && x.column === firstLane && x.claimed_by)
        warn("claimed-in-first-lane", [x.id], kind + " is claimed by " + x.claimed_by + " but still in " + firstLane +
          " — move it as you start, or release the claim (AGENTS.md §6)");
    }));
    stories.forEach(s => {
      if (s && s.id && doneLane && s.column === doneLane && s.ready === false)
        warn("done-not-ready", [s.id], "story is in " + doneLane + " but ready is false — only the human sets ready (AGENTS.md §2)");
    });

    // WIP limits: advisory, read in both grains the UI shows
    const wip = (cfg.wip_limits && typeof cfg.wip_limits === "object") ? cfg.wip_limits : {};
    Object.keys(wip).forEach(lane => {
      if (lanes.length && !lanes.includes(lane)) {
        warn("wip-unknown-lane", [], "wip_limits names \"" + lane + "\", which is not in config.lanes — the limit applies to nothing");
        return;
      }
      const lim = Number(wip[lane]);
      if (!isFinite(lim)) return;
      const liveEpics = epics.filter(e => e && !str(e.archived_at) && e.column === lane);
      const liveStories = stories.filter(s => s && s.column === lane && !archivedCard(s));
      if (liveEpics.length > lim || liveStories.length > lim)
        warn("wip-over-limit", liveEpics.length > lim ? liveEpics.map(e => e.id) : liveStories.map(s => s.id),
          "lane " + lane + " is over its WIP limit of " + lim + " (" + liveEpics.length + " epics, " + liveStories.length + " stories)");
    });

    // idea reasoning fields, from their documented vocabularies
    const IDEA_FIELDS = { conviction: ["speculative", "promising", "clear to pursue"],
      effort: ["low", "medium", "high"], impact: ["low", "medium", "high"] };
    ideas.forEach(i => {
      if (!i || !i.id) return;
      const st = IDEA_STATUS_LEGACY[str(i.status)] || str(i.status);
      if (st === "ready for review" && !str(i.decision))
        warn("review-idea-no-decision", [i.id], "idea is ready for review with no `decision` — say what the reviewer must answer (AGENTS.md §2)");
      Object.keys(IDEA_FIELDS).forEach(f => {
        const v = str(i[f]);
        if (v && !IDEA_FIELDS[f].includes(v.toLowerCase()))
          warn("idea-" + f, [i.id], "idea " + f + " \"" + v + "\" is not one of " + IDEA_FIELDS[f].join(" / ") + " (or empty)");
      });
    });

    // the saved view must name vocabulary the board has
    const view = (cfg.view && typeof cfg.view === "object") ? cfg.view : {};
    [["default_milestone", msVocab], ["default_theme", themes]].forEach(([f, list]) => {
      const v = str(view[f]);
      if (v && v !== "all" && !list.includes(v))
        warn("view-" + f.replace("_", "-"), [], "config.view." + f + " \"" + v + "\" is not in config." +
          (f === "default_milestone" ? "milestones" : "themes") + " — the board falls back to all");
    });

    /* ---- cycles in the epic dependency graph ---- */
    const colour = {};
    const walk = (id, path) => {
      if (colour[id] === 2) return;
      if (colour[id] === 1) {
        const loop = path.slice(path.indexOf(id)).concat(id);
        err("dep-cycle", loop, "dependency cycle: " + loop.join(" → "));
        return;
      }
      colour[id] = 1;
      arr(epicById[id] && epicById[id].deps).forEach(d => { if (epicById[d]) walk(d, path.concat(id)); });
      colour[id] = 2;
    };
    epics.forEach(e => { if (e && e.id) walk(e.id, []); });

    const rank = { error: 0, warning: 1 };
    out.sort((a, b) => rank[a.severity] - rank[b.severity] || a.code.localeCompare(b.code));
    return out;
  }

  const counts = findings => ({
    errors: findings.filter(f => f.severity === "error").length,
    warnings: findings.filter(f => f.severity === "warning").length,
  });

  return { diagnose, counts, hasArchitectureLine, hasCodeHealthLine, queuedReviews, isReviewsEpic, REVIEWS_TAG };
});
