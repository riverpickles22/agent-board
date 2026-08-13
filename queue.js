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
      prios: arr(cfg.priorities),
      epicById: Object.fromEntries(epics.filter(e => e && e.id).map(e => [e.id, e])),
    };
  }

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
    c.stories.forEach((s, ix) => {
      if (!s.ready || s.column === c.done) return;          // finished ≠ stuck
      if (s.column !== c.first || s.claimed_by) { readyButStuck++; return; }
      const ep = c.epicById[s.epic_id];
      if (!ep || ep.archived_at) return;                    // shipped and closed — not pickable
      if (!gateOpen(ep, c.cfg) || arr(ep.deps).some(d => {
        const dep = c.epicById[d]; return dep && dep.column !== c.done;
      })) { readyButStuck++; return; }
      picks.push({ story: s, epic: ep, ix, p: Math.max(0, c.prios.indexOf(s.priority)), er: epicIx.get(ep.id) });
    });
    picks.sort((a, b) => a.p - b.p || a.er - b.er || a.ix - b.ix);
    return { picks, readyButStuck, wip: wipBlocked(c) };
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
      if (arr(e.deps).some(d => { const dep = c.epicById[d]; return dep && dep.column !== c.done; })) { notes.deps++; return; }
      if (!gateOpen(e, c.cfg)) { notes.gate++; return; }
      if (e.claimed_by) { notes.claim++; return; }
      picks.push({ epic: e, ix, p: Math.max(0, c.prios.indexOf(e.priority)), u: unblocks(e.id) });
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

  function isStale(x, doneLane, now) {
    if (!x || !x.claimed_by || x.column === doneLane) return false;
    const at = Date.parse(x.claimed_at || "");
    return !isNaN(at) && at < now - CLAIM_STALE_MS;
  }
  function staleClaims(data, opts) {
    const now = (opts && opts.now) || Date.now();
    const c = ctx(data);
    return [].concat(c.epics, c.stories).filter(x => x && x.id && isStale(x, c.done, now));
  }

  /* Everything ./board status prints, one call. */
  function summary(data, opts) {
    const now = (opts && opts.now) || Date.now();
    const c = ctx(data);
    const live = c.epics.filter(e => !e.archived_at);
    const laneCount = list => Object.fromEntries(c.lanes.map(l => [l, list.filter(x => x.column === l).length]));
    return {
      lanes: c.lanes,
      epics: { total: live.length, archived: c.epics.length - live.length, byLane: laneCount(live) },
      stories: { total: c.stories.length, byLane: laneCount(c.stories) },
      needsYou: needsYou(data),
      inFlight: inFlight(data).map(s => ({ id: s.id, name: s.name, column: s.column,
        claimed_by: s.claimed_by, claimed_at: s.claimed_at, stale: isStale(s, c.done, now) })),
      pickable: pickable(data).picks.length,
      staleClaims: staleClaims(data, { now }).map(x => x.id),
    };
  }

  return { pickable, nextUp, inFlight, needsYou, staleClaims, summary, CLAIM_STALE_MS };
});
