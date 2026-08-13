#!/usr/bin/env node
/* Terminal front end for the board's read-side answers, and the one scaffold.
 *
 *   node board-cli.js next   <project|dir> [--json]
 *   node board-cli.js status <project|dir> [--json]
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

const ROOT = __dirname;
const REGISTRY = path.join(ROOT, "projects.json");

const tty = process.stdout.isTTY;
const c = (code, s) => tty ? "\x1b[" + code + "m" + s + "\x1b[0m" : s;
const red = s => c(31, s), yellow = s => c(33, s), green = s => c(32, s), dim = s => c(2, s), bold = s => c(1, s);

function projects() {
  try { return JSON.parse(fs.readFileSync(REGISTRY, "utf8")); } catch (e) { return {}; }
}

// A project name from the registry, a literal directory, or BOARD_DATA_DIR —
// the same three ways the skill locates a board.
function resolveDir(ref) {
  const reg = projects();
  if (ref && reg[ref]) return { name: ref, dir: path.resolve(reg[ref]) };
  if (ref && fs.existsSync(ref) && fs.statSync(ref).isDirectory())
    return { name: path.basename(ref), dir: path.resolve(ref) };
  if (!ref && process.env.BOARD_DATA_DIR)
    return { name: path.basename(process.env.BOARD_DATA_DIR), dir: path.resolve(process.env.BOARD_DATA_DIR) };
  if (ref) { console.error("Unknown project: " + ref); }
  else { console.error("Which board? Pass a project name or set BOARD_DATA_DIR."); }
  const names = Object.keys(reg);
  if (names.length) console.error("Registered: " + names.join(", "));
  process.exit(2);
}

function read(key, dir) {
  const file = path.join(dir, FILES[key]);
  if (!fs.existsSync(file)) return DEFAULTS[key];
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { console.error("✗ " + FILES[key] + " is not valid JSON — " + e.message); process.exit(1); }
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw[key])) return raw[key];   // the wrapped shape
  return raw;
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

/* ---- next: the pickable queue, PROTOCOL §3 executable ---- */
function cmdNext(ref, json) {
  const { name, dir } = resolveDir(ref);
  const data = load(dir);
  const { picks, readyButStuck, wip } = Q.pickable(data);
  const lanes = data.config.lanes || [];
  const workLane = lanes[1] || "the working lane";

  if (json) {
    return out({
      project: name, pickable: picks.map(p => ({
        id: p.story.id, name: p.story.name, epic: p.epic.id, epic_name: p.epic.name,
        priority: p.story.priority, kind: p.story.kind,
        criteria: (p.story.acceptance_criteria || []).length,
      })),
      ready_but_stuck: readyButStuck, wip_blocked: wip,
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

  if (json) return out({ project: name, title, ...sum, doctor: dx });

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
  console.log("\n" + bold("Ready to pick up · " + sum.pickable) + dim("   (./board next " + name + ")"));
  const laneLine = obj => sum.lanes.map(l => l + " " + (obj[l] || 0)).join(dim(" · "));
  console.log(dim("  epics:   ") + laneLine(sum.epics.byLane) + (sum.epics.archived ? dim("  (+" + sum.epics.archived + " shipped)") : ""));
  console.log(dim("  stories: ") + laneLine(sum.stories.byLane));
  console.log("\n" + (dx.errors ? red("⚕ " + dx.errors + " errors") : green("⚕ no errors")) +
    (dx.warnings ? dim(" · ") + yellow(dx.warnings + " warnings") : "") + dim("   (./board doctor " + name + ")"));
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
else if (cmd === "new") cmdNew(args[0], args[1]);
else { console.error("Usage: board-cli.js next|status|new …"); process.exit(2); }
