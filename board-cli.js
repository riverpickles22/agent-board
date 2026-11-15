#!/usr/bin/env node
/* Terminal front end for the board's read-side answers, and the one scaffold.
 *
 *   node board-cli.js next   <project|dir> [--json]
 *   node board-cli.js status <project|dir> [--json]
 *   node board-cli.js show   <id> <project|dir> [--json]
 *   node board-cli.js new    <name> <dir>
 *
 * All judgment lives in queue.js / doctor.js (the same modules the UI loads);
 * this file resolves a project, reads its files, and formats. It never edits
 * board data — picking, claiming and moving stay direct JSON edits under
 * AGENTS.md §6, and `new` only creates files that don't exist.
 */
const fs = require("fs");
const path = require("path");
const Q = require("./queue.js");
const { diagnose, counts } = require("./doctor.js");
const { FILES, DEFAULTS } = require("./defaults.js");
const { projects, resolveDir: resolveDirShared, REGISTRY } = require("./resolve.js");
const { read: readShared } = require("./read-data.js");

const ROOT = __dirname;

const tty = process.stdout.isTTY;
const c = (code, s) => tty ? "\x1b[" + code + "m" + s + "\x1b[0m" : s;
const red = s => c(31, s), yellow = s => c(33, s), green = s => c(32, s), dim = s => c(2, s), bold = s => c(1, s);

// A project name from the registry, a literal directory, or BOARD_DATA_DIR —
// the same three ways the skill locates a board. Lookup itself lives in
// resolve.js (shared with mcp-server.js); this wraps it with the CLI's own
// error reporting and exit code.
function resolveDir(ref) {
  const r = resolveDirShared(ref);
  if (r) return r;
  if (ref) { console.error("Unknown project: " + ref); }
  else { console.error("Which board? Pass a project name or set BOARD_DATA_DIR."); }
  const names = Object.keys(projects());
  if (names.length) console.error("Registered: " + names.join(", "));
  process.exit(2);
}

function read(key, dir) {
  try { return readShared(key, dir); }
  catch (e) { console.error("✗ " + e.message); process.exit(1); }
}
const load = dir => ({
  config: read("config", dir), epics: read("epics", dir), stories: read("stories", dir),
  ideas: read("ideas", dir), milestones: read("milestones", dir),
});

const since = iso => {
  const t = Date.parse(iso || ""); if (isNaN(t)) return "";
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 60) return m + "m ago";
  const h = Math.round(m / 60); return h < 24 ? h + "h ago" : Math.round(h / 24) + "d ago";
};

// Why first-lane work is not a pick, as one readable line (AGENTS.md §8).
function exclusionLine(x, firstLane) {
  if (!x) return "";
  const n = (k, one, many) => x[k] ? x[k] + " " + (x[k] === 1 ? one : many) : null;
  return [
    n("not_ready", "story waiting on the ready flag", "stories waiting on the ready flag"),
    n("claimed", "story claimed but still in " + firstLane, "stories claimed but still in " + firstLane),
    n("gated", "story behind a closed epic gate", "stories behind a closed epic gate"),
    n("deps", "story waiting on epic deps", "stories waiting on epic deps"),
    n("ungroomed", "epic in " + firstLane + " with no stories yet", "epics in " + firstLane + " with no stories yet"),
  ].filter(Boolean).join(" · ");
}

/* ---- next: the pickable queue, PROTOCOL §3 executable ---- */
function cmdNext(ref, json) {
  const { name, dir } = resolveDir(ref);
  const data = load(dir);
  const { picks, readyButStuck, wip, excluded } = Q.pickable(data);
  const lanes = data.config.lanes || [];
  const workLane = lanes[1] || "the working lane";

  if (json) {
    return out({
      project: name, pickable: picks.map(p => ({
        id: p.story.id, name: p.story.name, epic: p.epic.id, epic_name: p.epic.name,
        priority: p.story.priority, kind: p.story.kind,
        criteria: (p.story.acceptance_criteria || []).length,
      })),
      ready_but_stuck: readyButStuck, wip_blocked: wip, excluded,
      epic_grain: data.stories.length ? undefined : Q.nextUp(data).picks.map(p => p.epic.id),
      claim_protocol: "AGENTS.md §6: set claimed_by + claimed_at on the story, move it to \"" + workLane + "\", build, verify each acceptance criterion.",
    });
  }
  // A board with no stories still gets guidance — epic grain, PROTOCOL §3.
  if (!data.stories.length) {
    const { picks: ep, notes, wip: w } = Q.nextUp(data);
    console.log(bold("Next up (epic grain — no stories on this board) · " + name));
    if (!ep.length) console.log(dim("  nothing pickable" + (w ? " — WIP limit reached on \"" + workLane + "\"" :
      " · " + notes.deps + " waiting on deps, " + notes.gate + " gated, " + notes.claim + " claimed")));
    ep.slice(0, 10).forEach((p, i) =>
      console.log("  " + (i + 1) + ". " + bold(p.epic.id.padEnd(6)) + " " + p.epic.name + dim("  " + p.epic.priority + " · unblocks " + p.u)));
    return;
  }
  console.log(bold("Ready to pick up · " + picks.length) + dim(" · " + name));
  picks.forEach((p, i) => console.log(
    "  " + (i + 1) + ". " + bold(p.story.id.padEnd(7)) + " " + p.story.name + "\n" +
    dim("     " + [p.story.priority, p.story.kind, (p.story.acceptance_criteria || []).length + " criteria",
      "epic " + p.epic.id + " " + p.epic.name].join(" · "))));
  if (!picks.length) console.log(dim("  nothing pickable right now"));
  const why = exclusionLine(excluded, lanes[0]);
  if (why) console.log(dim("  not pickable: " + why));
  const notes = [];
  if (readyButStuck) notes.push(readyButStuck + " ready but claimed, moved, or behind an epic gate/dep");
  if (wip) notes.push("note: \"" + workLane + "\" is at its WIP limit");
  if (notes.length) console.log(dim("  " + notes.join(" · ")));
  console.log(dim("\nTo begin one (AGENTS.md §6): set claimed_by/claimed_at on the story, move it to \"" +
    workLane + "\", build, verify each acceptance criterion. Writes are JSON edits — this CLI never makes them."));
}

/* ---- status: cold-start orientation in one screen ---- */
function cmdStatus(ref, json) {
  const { name, dir } = resolveDir(ref);
  const data = load(dir);
  const sum = Q.summary(data);
  const findings = diagnose(data);
  const dx = counts(findings);
  const title = ((data.config.view || {}).title) || name;

  const closingOwed = findings.filter(f => f.code === "no-architecture-line" || f.code === "no-code-health")
    .map(f => ({ id: f.ids[0], review: f.code === "no-architecture-line" ? "architecture" : "code-health" }));
  if (json) return out({ project: name, title, ...sum, closingOwed, doctor: dx });

  console.log(bold(title) + dim(" · " + sum.epics.total + " epics · " + sum.stories.total +
    " stories · " + (data.ideas || []).length + " ideas · lanes: " + sum.lanes.join(" | ")));

  if (sum.needsYou.length) {
    console.log("\n" + yellow(bold("Needs you · " + sum.needsYou.length)) + dim("  (outranks everything — a person must answer)"));
    sum.needsYou.forEach(n => console.log("  " + bold(n.id.padEnd(7)) + " ⚠ needs " + n.ask +
      (n.reason ? dim(" — " + n.reason) : "")));
  }
  if (sum.inFlight.length) {
    console.log("\n" + bold("In flight · " + sum.inFlight.length));
    sum.inFlight.forEach(f => console.log("  " + bold(f.id.padEnd(7)) + " " + f.column + dim(" · " + f.claimed_by +
      (since(f.claimed_at) ? " · " + since(f.claimed_at) : "")) + (f.stale ? yellow(" ⚠ stale") : "")));
  }
  // Closing reviews owed (AGENTS.md §6 steps 8–9): an agent's work, not the
  // human's — the doctor's own findings, listed so a cold start acts on them.
  const owed = {};
  closingOwed.forEach(c => (owed[c.id] = owed[c.id] || []).push(c.review));
  const owedIds = Object.keys(owed);
  if (owedIds.length) {
    console.log("\n" + yellow(bold("Closing reviews owed · " + owedIds.length)) +
      dim("  (do these now — dispatch the architecture-reviewer on the latest changes; AGENTS.md §6 steps 8–9)"));
    owedIds.forEach(id => console.log("  " + bold(id.padEnd(7)) + " " + owed[id].join(" + ")));
  }
  const w = sum.waitingOnYou;
  const pl = (n, one, many) => n + " " + (n === 1 ? one : many);
  const parts = [
    w.needs && pl(w.needs, "open need", "open needs"),
    w.reviewCards && pl(w.reviewCards, "card", "cards") + " in " + sum.lanes[sum.lanes.length - 2],
    w.reviewIdeas && pl(w.reviewIdeas, "idea", "ideas") + " ready for review",
    w.unpromotedIdeas && pl(w.unpromotedIdeas, "idea", "ideas") + " ready to implement, not promoted",
    w.awaitingReady && pl(w.awaitingReady, "story", "stories") + " awaiting the ready flag",
  ].filter(Boolean);
  console.log("\n" + (w.total ? yellow(bold("Waiting on you · " + w.total)) : bold("Waiting on you · 0")) +
    (parts.length ? dim("  (" + parts.join(" · ") + ")") : ""));
  console.log("\n" + bold("Ready to pick up · " + sum.pickable) + dim("   (./board next " + name + ")"));
  if (!sum.pickable) { const why = exclusionLine(sum.excluded, sum.lanes[0]); if (why) console.log(dim("  not pickable: " + why)); }
  const laneLine = obj => sum.lanes.map(l => l + " " + (obj[l] || 0)).join(dim(" · "));
  console.log(dim("  epics:   ") + laneLine(sum.epics.byLane) + (sum.epics.archived ? dim("  (+" + sum.epics.archived + " shipped)") : ""));
  console.log(dim("  stories: ") + laneLine(sum.stories.byLane));
  console.log("\n" + (dx.errors ? red("⚕ " + dx.errors + " errors") : green("⚕ no errors")) +
    (dx.warnings ? dim(" · ") + yellow(dx.warnings + " warnings") : "") + dim("   (./board doctor " + name + ")"));
}

/* ---- show: one card (or idea) with the context a builder needs ---- */
function cmdShow(id, ref, json) {
  if (!id) { console.error("Usage: ./board show <id> <project> [--json]"); process.exit(2); }
  const { name, dir } = resolveDir(ref);
  const data = load(dir);
  const cfg = data.config || {};
  const lanes = cfg.lanes || [];
  const done = lanes[lanes.length - 1];
  const gateOpen = e => !e.gate || e.gate === "none" || (cfg.open_gates || []).includes(e.gate);
  const epicById = id => data.epics.find(e => e.id === id);
  const depState = e => (e.deps || []).map(d => { const x = epicById(d);
    return { id: d, column: x ? x.column : null, done: !!x && x.column === done }; });
  const lite = s => ({ id: s.id, name: s.name, column: s.column, ready: !!s.ready, claimed_by: s.claimed_by || null });
  const epicCtx = e => ({ id: e.id, name: e.name, column: e.column, milestone: e.milestone || "",
    test_plan: e.test_plan || "", context_docs: e.context_docs || [], gate: e.gate || "none",
    gate_open: gateOpen(e), deps: depState(e), archived_at: e.archived_at || null });

  const find = list => list.find(x => x && x.id === id) ||
    list.find(x => x && typeof x.id === "string" && x.id.toLowerCase() === String(id).toLowerCase());
  const story = find(data.stories), epic = !story && find(data.epics), idea = !story && !epic && find(data.ideas || []);
  if (!story && !epic && !idea) {
    console.error("No epic, story or idea with id \"" + id + "\" in project " + name + " (" + dir + ")");
    process.exit(1);
  }

  let obj;
  if (story) {
    const ep = epicById(story.epic_id);
    obj = { project: name, type: "story", story,
      epic: ep ? epicCtx(ep) : null,
      siblings: ep ? data.stories.filter(s => s.epic_id === ep.id && s.id !== story.id).map(lite) : [] };
  } else if (epic) {
    obj = { project: name, type: "epic", epic, gate_open: gateOpen(epic), deps: depState(epic),
      stories: data.stories.filter(s => s.epic_id === epic.id).map(lite) };
  } else {
    obj = { project: name, type: "idea", idea };
  }
  if (json) return out(obj);

  const pad = (s, n) => String(s).split("\n").map(l => " ".repeat(n) + l).join("\n");
  const field = (label, v) => {
    if (v == null || v === "" || (Array.isArray(v) && !v.length)) return;
    if (Array.isArray(v)) {
      console.log("\n" + bold(label));
      v.forEach((x, i) => console.log(pad((i + 1) + ". " + (typeof x === "string" ? x : JSON.stringify(x)), 2)));
    } else if (typeof v === "object") {
      console.log("\n" + bold(label) + "\n" + pad(JSON.stringify(v, null, 2), 2));
    } else console.log("\n" + bold(label) + "\n" + pad(v, 2));
  };
  const docs = list => (list || []).map(d => typeof d === "string" ? d : (d.path + (d.label ? " — " + d.label : "") + (d.note ? " (" + d.note + ")" : "")));
  const claim = x => x.claimed_by ? "claimed by " + x.claimed_by + (since(x.claimed_at) ? " · " + since(x.claimed_at) : "") : "unclaimed";
  const needsLine = x => { if (!x.needs) return;
    const n = x.needs; console.log(yellow("⚠ needs " + (typeof n === "string" ? "decision — " + n : (n.kind || "decision") + " — " + (n.reason || "")))); };
  const rows = (list) => list.forEach(s => console.log("  " + bold(s.id.padEnd(8)) + " " + String(s.column).padEnd(12) + " " + s.name +
    dim((s.ready ? "" : " · not ready") + (s.claimed_by ? " · " + s.claimed_by : ""))));

  if (story) {
    const s = story;
    console.log(bold(s.id) + " " + s.name);
    console.log(dim(["story", s.kind, s.column, s.priority, s.ready ? "ready" : "not ready", claim(s)].filter(Boolean).join(" · ") + " · " + name));
    needsLine(s);
    field("Description", s.description);
    field("Acceptance criteria", s.acceptance_criteria);
    field("How to test", s.how_to_test);
    field("Context", s.context);
    field("Systems", (s.systems || []).join(", "));
    field("Notes", s.notes);
    const ep = obj.epic;
    if (!ep) { console.log("\n" + yellow("epic " + s.epic_id + " not found")); return; }
    console.log("\n" + dim("─── epic ───") + "\n" + bold(ep.id) + " " + ep.name);
    console.log(dim([ep.column, ep.milestone, "gate " + ep.gate + (ep.gate === "none" ? "" : ep.gate_open ? " (open)" : " (closed)"),
      ep.deps.length ? "deps " + ep.deps.map(d => d.id + (d.done ? " ✓" : " (" + (d.column || "missing") + ")")).join(", ") : "no deps",
      ep.archived_at ? "archived " + ep.archived_at : ""].filter(Boolean).join(" · ")));
    field("Test plan", ep.test_plan);
    field("Context docs", docs(ep.context_docs));
    if (obj.siblings.length) { console.log("\n" + bold("Sibling stories")); rows(obj.siblings); }
  } else if (epic) {
    const e = epic;
    console.log(bold(e.id) + " " + e.name);
    console.log(dim(["epic", e.column, e.priority, e.theme, e.milestone, e.status, claim(e),
      e.archived_at ? "archived " + e.archived_at : ""].filter(Boolean).join(" · ") + " · " + name));
    needsLine(e);
    console.log(dim("gate " + (e.gate || "none") + (!e.gate || e.gate === "none" ? "" : obj.gate_open ? " (open)" : " (closed)") + " · " +
      (obj.deps.length ? "deps " + obj.deps.map(d => d.id + (d.done ? " ✓" : " (" + (d.column || "missing") + ")")).join(", ") : "no deps")));
    field("Description", e.description);
    field("Notes", e.notes);
    field("Test plan", e.test_plan);
    field("Context docs", docs(e.context_docs));
    field("Systems", (e.systems || []).join(", "));
    console.log("\n" + bold("Stories · " + obj.stories.length));
    if (obj.stories.length) rows(obj.stories); else console.log(dim("  none — not groomed yet (AGENTS.md §5)"));
  } else {
    const i = idea;
    console.log(bold(i.id) + " " + i.title);
    console.log(dim(["idea", i.status, i.priority, i.category, i.theme, i.milestone,
      i.effort ? "effort " + i.effort : "", i.impact ? "impact " + i.impact : "", i.conviction,
      i.promoted_to ? "promoted to " + i.promoted_to : ""].filter(Boolean).join(" · ") + " · " + name));
    field("Decision", i.decision);
    field("Why now", i.why_now);
    field("Description", i.description);
    field("Context", i.context);
    field("Compounding", i.compounding);
    field("Pros", i.pros); field("Cons", i.cons);
    field("Constraints", i.constraints); field("Acceptance", i.acceptance); field("Validation", i.validation);
    (i.sections || []).forEach(x => field(x.title || "Section", x.body));
    field("Deps", (i.deps || []).join(", "));
    field("Notes", i.notes);
    field("Rejected", i.rejected_reason);
    field("Log", (i.log || []).map(l => (l.at || "") + " — " + (l.note || "")));
  }
}

/* ---- new: scaffold + register a project ---- */
function cmdNew(name, dir) {
  if (!name || !dir) { console.error("Usage: ./board new <name> <directory>"); process.exit(2); }
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) {
    console.error("Invalid name \"" + name + "\" — letters, digits, . _ - only (it becomes a URL segment)."); process.exit(1);
  }
  const reg = projects();
  if (reg[name]) { console.error("\"" + name + "\" is already registered → " + reg[name]); process.exit(1); }
  dir = path.resolve(dir);

  fs.mkdirSync(dir, { recursive: true });
  const made = [], kept = [];
  for (const [key, file] of Object.entries(FILES)) {
    const target = path.join(dir, file);
    if (fs.existsSync(target)) { kept.push(file); continue; }   // adopt, never overwrite
    const val = key === "config"
      ? { ...DEFAULTS.config, view: { ...DEFAULTS.config.view, title: name + " — backlog" } }
      : DEFAULTS[key];
    fs.writeFileSync(target, JSON.stringify(val, null, 2) + "\n");
    made.push(file);
  }
  reg[name] = dir;
  fs.writeFileSync(REGISTRY, JSON.stringify(reg, null, 2) + "\n");

  console.log(green("✓ ") + bold(name) + " registered → " + dir);
  if (made.length) console.log("  created: " + made.join(", "));
  if (kept.length) console.log("  adopted as-is (already existed): " + kept.join(", "));
  console.log("\n  Serve it:    ./board " + name + "   → http://localhost:4300/" + name + "/");
  console.log("  Contract:    " + path.join(ROOT, "AGENTS.md") + " (schemas, rules — also served at /AGENTS.md)");
  // Commits are how the board is ratified (AGENTS.md §4); a board outside
  // git works, but nothing it does is ever durable.
  let inGit = false, probe = dir;
  while (probe !== path.dirname(probe)) { if (fs.existsSync(path.join(probe, ".git"))) { inGit = true; break; } probe = path.dirname(probe); }
  if (!inGit) console.log(yellow("\n  note: ") + dir + " is not inside a git repository — commits are how board\n" +
    "  state is ratified (AGENTS.md §4), so run git init there before real work.");
}

function out(obj) { console.log(JSON.stringify(obj, null, 2)); }

const [cmd, ...rest] = process.argv.slice(2);
const json = rest.includes("--json");
const args = rest.filter(a => a !== "--json");
if (cmd === "next") cmdNext(args[0], json);
else if (cmd === "status") cmdStatus(args[0], json);
else if (cmd === "show") cmdShow(args[0], args[1], json);
else if (cmd === "new") cmdNew(args[0], args[1]);
else { console.error("Usage: board-cli.js next|status|show|new …"); process.exit(2); }
