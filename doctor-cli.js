#!/usr/bin/env node
/* Terminal front end for doctor.js — loads a project's five files and prints
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
};

const findings = diagnose(data);
const { errors, warnings } = counts(findings);

const tty = process.stdout.isTTY;
const c = (code, s) => tty ? "[" + code + "m" + s + "[0m" : s;
const red = s => c(31, s), yellow = s => c(33, s), green = s => c(32, s), dim = s => c(2, s);

const scale = [
  data.epics.length + " epic" + (data.epics.length === 1 ? "" : "s"),
  data.stories.length + " stor" + (data.stories.length === 1 ? "y" : "ies"),
  data.ideas.length + " idea" + (data.ideas.length === 1 ? "" : "s"),
].join(", ");

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
