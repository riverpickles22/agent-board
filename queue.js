/* The selection rule, extracted — PROTOCOL §3 and the story-grain ready
 * queue as one pure module.
 *
 * These rules lived inside index.html, which meant a CLI answering "what's
 * next" would have to re-implement them — the exact drift doctor.js exists
 * to prevent. Same pattern here: no I/O, no DOM, injectable clock; the UI
 * loads this as a <script>, `./board next` / `./board status` require() it,
 * and both front ends compute the identical answer or neither does.
 *
 * Nothing in here writes. Picking, claiming and moving stay direct JSON
 * edits under AGENTS.md §6 — this module only reads the state and ranks it.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BoardQueue = api;
})(typeof self !== "undefined" ? self : this, function () {

  const CLAIM_STALE_MS = 48 * 3600 * 1000;

  const arr = v => Array.isArray(v) ? v : [];

  function ctx(data) {
    const cfg = (data && data.config) || {};
    const lanes = arr(cfg.lanes);
    const epics = arr(data && data.epics);
    return {
      cfg, epics,
      stories: arr(data && data.stories),
      lanes,
      first: lanes[0],
      done: lanes[lanes.length - 1],
      // the review lane, read as the UI and doctor read it: the lane before
      // done when the board has more than three (B36)
      review: lanes.length > 3 ? lanes[lanes.length - 2] : null,
      prios: arr(cfg.priorities),
      epicById: Object.fromEntries(epics.filter(e => e && e.id).map(e => [e.id, e])),
    };
  }

  // A priority's tier. An unknown or missing priority sorts after every
  // known one — it is a vocabulary slip, never a reason to jump the queue.
  const tier = (c, p) => { const i = c.prios.indexOf(p); return i < 0 ? c.prios.length : i; };

  const depsUndone = (e, c) => arr(e.deps).some(d => {
    const dep = c.epicById[d]; return dep && dep.column !== c.done;
  });

  const gateOpen = (e, cfg) => !e.gate || e.gate === "none" || arr(cfg.open_gates).includes(e.gate);

  // PROTOCOL §3.5: a pick moves into the first lane's successor; a full
  // wip-limited successor blocks every pick. The count is epics, board-wide.
  function wipBlocked(c) {
    const lane = c.lanes[1];
    const lim = (c.cfg.wip_limits || {})[lane];
    return !!lane && lim != null && c.epics.filter(e => e.column === lane).length >= lim;
  }

  /* Story grain — what an agent can claim right now (the Ready queue's rule):
   * ready:true + first lane + unclaimed + epic unarchived, gate open, deps
   * done. Ranked story priority → epic file order → story file order. */
  function pickable(data) {
    const c = ctx(data);
    const epicIx = new Map(c.epics.map((e, i) => [e.id, i]));
    const picks = [];
    let readyButStuck = 0;
    // Why each first-lane story under a live epic is not a pick — one reason
    // per story, so the counts add up (AGENTS.md §8: report why).
    const excluded = { not_ready: 0, claimed: 0, gated: 0, deps: 0, ungroomed: 0 };
    c.stories.forEach((s, ix) => {
      const ep = c.epicById[s.epic_id];
      if (s.column === c.first && ep && !ep.archived_at) {
        if (s.claimed_by) excluded.claimed++;
        else if (!s.ready) excluded.not_ready++;
        else if (!gateOpen(ep, c.cfg)) excluded.gated++;
        else if (depsUndone(ep, c)) excluded.deps++;
      }
      if (!s.ready || s.column === c.done) return;          // finished ≠ stuck
      if (s.column !== c.first || s.claimed_by) { readyButStuck++; return; }
      if (!ep || ep.archived_at) return;                    // shipped and closed — not pickable
      if (!gateOpen(ep, c.cfg) || depsUndone(ep, c)) { readyButStuck++; return; }
      picks.push({ story: s, epic: ep, ix, p: tier(c, s.priority), er: epicIx.get(ep.id) });
    });
    // epics committed to the first lane with no stories yet — nothing to pick
    // until someone grooms them (AGENTS.md §5)
    const hasStories = new Set(c.stories.map(s => s.epic_id));
    excluded.ungroomed = c.epics.filter(e => !e.archived_at && e.column === c.first && !hasStories.has(e.id)).length;
    picks.sort((a, b) => a.p - b.p || a.er - b.er || a.ix - b.ix);
    return { picks, readyButStuck, wip: wipBlocked(c), excluded };
  }

  /* Epic grain — PROTOCOL §3 verbatim, the fallback for a board with no
   * stories. Ranked priority → unblock count → file order. */
  function nextUp(data) {
    const c = ctx(data);
    const unblocks = id => c.epics.filter(x => arr(x.deps).includes(id)).length;
    const notes = { deps: 0, gate: 0, claim: 0 };
    const picks = [];
    c.epics.forEach((e, ix) => {
      if (e.archived_at || e.column !== c.first) return;
      if (depsUndone(e, c)) { notes.deps++; return; }
      if (!gateOpen(e, c.cfg)) { notes.gate++; return; }
      if (e.claimed_by) { notes.claim++; return; }
      picks.push({ epic: e, ix, p: tier(c, e.priority), u: unblocks(e.id) });
    });
    picks.sort((a, b) => a.p - b.p || b.u - a.u || a.ix - b.ix);
    const wip = wipBlocked(c);
    return { picks: wip ? [] : picks, notes, wip };
  }

  /* Claimed and moving — stories held by someone, out of the first lane and
   * not yet done, under a live epic. */
  function inFlight(data) {
    const c = ctx(data);
    return c.stories.filter(s => {
      const ep = c.epicById[s.epic_id];
      if (!ep || ep.archived_at) return false;
      return s.claimed_by && s.column !== c.done && s.column !== c.first;
    });
  }

  /* The one state that asks for a person (AGENTS.md §2) — epics and stories
   * carrying `needs`, outside the done lane. */
  function needsYou(data) {
    const c = ctx(data);
    const read = (x, kind) => {
      if (!x.needs || x.column === c.done) return null;
      if (kind === "story") { const ep = c.epicById[x.epic_id]; if (!ep || ep.archived_at) return null; }
      else if (x.archived_at) return null;
      const n = x.needs;
      return { id: x.id, kind,
        ask: (typeof n === "string") ? "decision" : (n.kind || "decision"),
        reason: (typeof n === "string") ? n : (n.reason || "") };
    };
    return [].concat(
      c.epics.map(e => read(e, "epic")),
      c.stories.map(s => read(s, "story"))
    ).filter(Boolean);
  }

  // THE stale-claim rule — the page (claimIsStale) and doctor.js call this,
  // and nothing else defines it (B42-1).
  // Stale means "the claimer should be working here and has not been seen
  // for 48h". In the done lane nobody is waited on; in the review lane the
  // card waits on the HUMAN, and the claim only says who built it (B36) —
  // so neither lane is ever stale. Suspect, never auto-cleared (B21-1).
  function isStale(x, doneLane, now, reviewLane) {
    if (!x || !x.claimed_by || x.column === doneLane || (reviewLane && x.column === reviewLane)) return false;
    const at = Date.parse(x.claimed_at || "");
    return !isNaN(at) && at < now - CLAIM_STALE_MS;
  }
  function staleClaims(data, opts) {
    const now = (opts && opts.now) || Date.now();
    const c = ctx(data);
    return [].concat(c.epics, c.stories).filter(x => x && x.id && isStale(x, c.done, now, c.review));
  }

  // Idea statuses renamed over time; read a legacy value as its modern stage
  // (the union of the UI's and doctor's readings).
  const IDEA_LEGACY = { considering: "ready for review", shaping: "ready for review",
    planned: "ready to implement", building: "ready to implement", exploring: "idea" };
  const ideaStage = i => { const st = String((i && i.status) || "").trim(); return IDEA_LEGACY[st] || st; };

  /* Everything that waits on a person right now — derived, never stored.
   * needs (open asks), cards in the review lane, ideas ready for review,
   * ideas cleared to implement but never promoted, and first-lane stories
   * still waiting on the human's ready flag. A card counted in more than one
   * part appears once in `total` and `items`. */
  function waitingOnYou(data) {
    const c = ctx(data);
    const ideas = arr(data && data.ideas);
    const liveEpic = id => { const ep = c.epicById[id]; return !!ep && !ep.archived_at; };
    const items = [], seen = new Set();
    const push = (kind, id, title) => {
      if (!id || seen.has(id)) return;
      seen.add(id); items.push({ kind, id, title: title || "" });
    };
    const titleOf = id => { const x = c.epicById[id] || c.stories.find(s => s.id === id); return x ? x.name : ""; };

    const needs = needsYou(data);
    needs.forEach(n => push("needs", n.id, titleOf(n.id)));

    const review = c.review ? [].concat(
      c.epics.filter(e => e.column === c.review && !e.archived_at),
      c.stories.filter(s => s.column === c.review && liveEpic(s.epic_id))
    ) : [];
    review.forEach(x => push("review", x.id, x.name));

    const reviewIdeas = ideas.filter(i => i && ideaStage(i) === "ready for review");
    reviewIdeas.forEach(i => push("review-idea", i.id, i.title));

    const unpromoted = ideas.filter(i => i && ideaStage(i) === "ready to implement" && !i.promoted_to);
    unpromoted.forEach(i => push("unpromoted-idea", i.id, i.title));

    const awaiting = c.stories.filter(s => s.column === c.first && !s.ready && liveEpic(s.epic_id));
    awaiting.forEach(s => push("awaiting-ready", s.id, s.name));

    return { total: items.length, needs: needs.length, reviewCards: review.length,
      reviewIdeas: reviewIdeas.length, unpromotedIdeas: unpromoted.length,
      awaitingReady: awaiting.length, items };
  }

  /* Everything ./board status prints, one call. */
  function summary(data, opts) {
    const now = (opts && opts.now) || Date.now();
    const c = ctx(data);
    const live = c.epics.filter(e => !e.archived_at);
    const laneCount = list => Object.fromEntries(c.lanes.map(l => [l, list.filter(x => x.column === l).length]));
    const pk = pickable(data);
    return {
      lanes: c.lanes,
      epics: { total: live.length, archived: c.epics.length - live.length, byLane: laneCount(live) },
      stories: { total: c.stories.length, byLane: laneCount(c.stories) },
      needsYou: needsYou(data),
      inFlight: inFlight(data).map(s => ({ id: s.id, name: s.name, column: s.column,
        claimed_by: s.claimed_by, claimed_at: s.claimed_at, stale: isStale(s, c.done, now, c.review) })),
      pickable: pk.picks.length,
      excluded: pk.excluded,
      waitingOnYou: waitingOnYou(data),
      staleClaims: staleClaims(data, { now }).map(x => x.id),
    };
  }

  /* ---- capabilities (AGENTS.md §2): the registry's fixed words and the one
   * derived answer, "where does this capability stand". The doctor, the CLI,
   * the MCP tool and the page all read these, so they cannot disagree. ---- */
  const CAP_KINDS = ["code", "skill", "agent", "rule", "practice"];
  const CAP_IMPACTS = ["high", "medium", "low"];
  const CAP_ADOPTION = ["wanted", "building", "in use", "not needed"];
  const CAP_STATUSES = ["skipped", "retired"];          // the only stored ones; the human's
  const CAP_STATES = ["in use", "building", "proposed", "skipped", "retired"];

  // Overall state is derived from adoption, never stored — except the two
  // the human sets, which win.
  function capabilityState(cap) {
    if (cap && CAP_STATUSES.includes(cap.status)) return cap.status;
    const states = arr(cap && cap.adoption).map(a => a && a.state);
    if (states.includes("in use")) return "in use";
    if (states.includes("building")) return "building";
    return "proposed";
  }

  // "arc:A68" names a card on another board; a bare id is this board's.
  function parseRef(ref) {
    const s = String(ref == null ? "" : ref).trim(), i = s.indexOf(":");
    return i > 0 ? { ref: s, project: s.slice(0, i), id: s.slice(i + 1) } : { ref: s, project: null, id: s };
  }

  // Registry order: impact first, then a capability after the ones it
  // depends on, then file order. A cycle (the doctor's to report) falls
  // back to file order for the cards in it.
  function capabilityOrder(caps) {
    const list = arr(caps).filter(c => c && c.id);
    const byId = Object.fromEntries(list.map(c => [c.id, c]));
    const tier = c => { const i = CAP_IMPACTS.indexOf(c.impact); return i < 0 ? CAP_IMPACTS.length : i; };
    const sorted = list.map((c, i) => [c, i]).sort((a, b) => tier(a[0]) - tier(b[0]) || a[1] - b[1]).map(x => x[0]);
    const out = [], placed = new Set(), visiting = new Set();
    const place = c => {
      if (placed.has(c.id) || visiting.has(c.id)) return;
      visiting.add(c.id);
      arr(c.deps).forEach(d => { if (byId[d]) place(byId[d]); });
      visiting.delete(c.id);
      placed.add(c.id); out.push(c);
    };
    sorted.forEach(place);
    return out;
  }

  // What ./board capabilities prints: every record in registry order with
  // its derived state, the projects any record names, and the counts.
  function capabilities(data) {
    const caps = capabilityOrder(data && data.capabilities).map(c => Object.assign({}, c, { state: capabilityState(c) }));
    const projects = [];
    caps.forEach(c => arr(c.adoption).forEach(a => { if (a && a.project && !projects.includes(a.project)) projects.push(a.project); }));
    const counts = Object.fromEntries(CAP_STATES.map(s => [s, caps.filter(c => c.state === s).length]));
    return { projects, capabilities: caps, counts };
  }

  return { pickable, nextUp, inFlight, needsYou, waitingOnYou, staleClaims, summary, isStale, CLAIM_STALE_MS,
           capabilities, capabilityState, capabilityOrder, parseRef,
           CAP_KINDS, CAP_IMPACTS, CAP_ADOPTION, CAP_STATUSES, CAP_STATES };
});
