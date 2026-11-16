#!/usr/bin/env node
/* Terminal front end for doctor.js — loads a project's six files and prints
 * what the shared check function found. All the judgment lives in doctor.js;
 * this file only reads, formats, and picks the exit code.
 *
 *   node doctor-cli.js <data-dir> [project-name]
 *
 * Exit 1 when there are errors, 0 otherwise (warnings never fail).
 */
const fs = require("fs");
const path = require("path");
const { diagnose, counts } = require("./doctor.js");

const DIR = process.argv[2];
const NAME = process.argv[3] || path.basename(DIR || "");
if (!DIR) { console.error("Usage: node doctor-cli.js <data-dir> [name]"); process.exit(2); }
if (!fs.existsSync(DIR)) { console.error("No such data directory: " + DIR); process.exit(2); }

// Files are written either as a bare array or as { <key>: [...] } depending on
// which tool last touched them; both shapes have always been accepted.
function read(key, fallback, unwrap) {
  const file = path.join(DIR, key + ".json");
  if (!fs.existsSync(file)) return fallback;
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { console.error("✗ " + key + ".json is not valid JSON — " + e.message); process.exit(1); }
  if (!unwrap) return raw;                       // milestones.json is a document, not a list
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw[key])) return raw[key];
  return raw;
}

const data = {
  config: read("config", {}, false),
  epics: read("epics", [], true),
  stories: read("stories", [], true),
  ideas: read("ideas", [], true),
  milestones: read("milestones", { milestones: [] }, false),
  capabilities: read("capabilities", [], true),
};

const findings = diagnose(data).concat(contextDocFindings(), capabilityFindings());
const rank = { error: 0, warning: 1 };
findings.sort((a, b) => rank[a.severity] - rank[b.severity] || a.code.localeCompare(b.code));
const { errors, warnings } = counts(findings);

/* context_docs paths are relative to the context repo's root — the git repo
 * that holds the data dir (AGENTS.md §1). Checking them needs the
 * filesystem, so this lives here and not in doctor.js, which the browser
 * loads too. A warning, never an error: a moved doc degrades a card, it does
 * not break the board. */
function contextRoot(dir) {
  let probe = path.resolve(dir);
  while (probe !== path.dirname(probe)) {
    if (fs.existsSync(path.join(probe, ".git"))) return probe;
    probe = path.dirname(probe);
  }
  return path.dirname(path.resolve(dir));   // no git: the data dir's parent
}
/* A capability may name another board — an adoption's project, or a
 * "<project>:<id>" link. Only the registry and that board's files can say
 * whether it is real, so these two checks live here beside the other
 * filesystem one. Function declarations hoist, so `data` is read at call. */
function capabilityFindings() {
  const { projects, findCard } = require("./resolve.js");
  const { parseRef } = require("./queue.js");
  const reg = projects(), cache = {}, found = [];
  data.capabilities.forEach(c => {
    if (!c || !c.id) return;
    const unknown = new Set((Array.isArray(c.adoption) ? c.adoption : [])
      .map(a => a && typeof a.project === "string" ? a.project.trim() : "").filter(p => p && !reg[p]));
    unknown.forEach(project => {
      const a = { project };
        found.push({ severity: "warning", code: "capability-project-unknown", ids: [c.id, a.project],
          message: "adoption names project \"" + a.project + "\" — not registered in projects.json" });
    });
    (Array.isArray(c.links) ? c.links : []).forEach(l => {
      if (!parseRef(l).project) return;                       // own-board links are doctor.js's
      const r = findCard(l, data, cache);
      if (!r.found) found.push({ severity: "warning", code: "capability-link-missing", ids: [c.id, r.ref],
        message: "capability links " + r.ref + " — " + r.why });
    });
  });
  return found;
}
function contextDocFindings() {
  const root = contextRoot(DIR);
  const found = [];
  const check = (owner, docs) => (Array.isArray(docs) ? docs : []).forEach(d => {
    const raw = typeof d === "string" ? d : (d && d.path);
    if (typeof raw !== "string" || !raw.trim()) return;
    const p = raw.trim().replace(/#.*$/, "");
    if (!p || /^[a-z][a-z0-9+.-]*:\/\//i.test(p)) return;   // URLs are not ours to check
    const abs = path.isAbsolute(p) ? p : path.join(root, p);
    if (!fs.existsSync(abs)) found.push({ severity: "warning", code: "context-doc-missing", ids: owner ? [owner] : [],
      message: "context_docs path \"" + raw + "\" does not exist under " + root });
  });
  data.epics.forEach(e => { if (e && e.id && !e.archived_at) check(e.id, e.context_docs); });
  const ms = data.milestones || {};
  check("overview", ms.overview && ms.overview.context_docs);
  (Array.isArray(ms) ? ms : (ms.milestones || [])).forEach(m => { if (m) check(m.id, m.context_docs); });
  return found;
}

const tty = process.stdout.isTTY;
const c = (code, s) => tty ? "[" + code + "m" + s + "[0m" : s;
const red = s => c(31, s), yellow = s => c(33, s), green = s => c(32, s), dim = s => c(2, s);

const scale = [
  data.epics.length + " epic" + (data.epics.length === 1 ? "" : "s"),
  data.stories.length + " stor" + (data.stories.length === 1 ? "y" : "ies"),
  data.ideas.length + " idea" + (data.ideas.length === 1 ? "" : "s"),
].concat(data.capabilities.length ? [data.capabilities.length + " capabilit" + (data.capabilities.length === 1 ? "y" : "ies")] : [])
.join(", ");

if (!findings.length) {
  console.log(green("✓ no issues") + dim(" · " + NAME + " · " + scale));
  process.exit(0);
}

console.log(
  (errors ? red("✗ " + errors + " error" + (errors === 1 ? "" : "s")) : green("✓ no errors")) +
  (warnings ? dim(" · ") + yellow(warnings + " warning" + (warnings === 1 ? "" : "s")) : "") +
  dim(" · " + NAME + " · " + scale)
);

// Widest id column across everything printed, so the messages line up.
const label = f => f.ids.length ? f.ids[0] : "—";
const w = Math.min(22, findings.reduce((m, f) => Math.max(m, label(f).length), 0));

const section = (severity, title, paint) => {
  const rows = findings.filter(f => f.severity === severity);
  if (!rows.length) return;
  console.log("\n" + paint(title));
  rows.forEach(f => {
    const rest = f.ids.slice(1);
    console.log("  " + label(f).padEnd(w) + "  " + f.message +
      (rest.length ? dim("  [" + rest.join(", ") + "]") : "") + dim("  (" + f.code + ")"));
  });
};
section("error", "ERRORS", red);
section("warning", "WARNINGS", yellow);

console.log("\n" + dim("Nothing was changed — the doctor reports, it never repairs."));
process.exit(errors ? 1 : 0);
