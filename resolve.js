/* Resolves which project a name refers to — the same three ways every
 * board-reading surface locates one: a registered name in projects.json, a
 * literal directory, or BOARD_DATA_DIR. Shared by board-cli.js and
 * mcp-server.js so the lookup rules can never drift between them.
 */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const REGISTRY = path.join(ROOT, "projects.json");

function projects() {
  try { return JSON.parse(fs.readFileSync(REGISTRY, "utf8")); } catch (e) { return {}; }
}

// Returns { name, dir } or null if ref (or BOARD_DATA_DIR, when ref is
// omitted) doesn't resolve to anything — callers decide how to report that.
function resolveDir(ref) {
  const reg = projects();
  if (ref && reg[ref]) return { name: ref, dir: path.resolve(reg[ref]) };
  if (ref && fs.existsSync(ref) && fs.statSync(ref).isDirectory())
    return { name: path.basename(ref), dir: path.resolve(ref) };
  if (!ref && process.env.BOARD_DATA_DIR)
    return { name: path.basename(process.env.BOARD_DATA_DIR), dir: path.resolve(process.env.BOARD_DATA_DIR) };
  return null;
}

/* A capability's links name cards — a bare id on its own board, or
 * "<project>:<id>" on another registered one (AGENTS.md §2). This looks one
 * up and says what and where it is, reading the other board's files when it
 * must. Shared by the CLI, the MCP server and the doctor's CLI so a link
 * resolves the same way in all three. `own` is the already-loaded data of
 * the board holding the capability; `cache` saves re-reading a board. */
function findCard(ref, own, cache) {
  const { parseRef } = require("./queue.js");
  const { read } = require("./read-data.js");
  const r = parseRef(ref);
  let data = own;
  if (r.project) {
    const reg = projects();
    if (!reg[r.project]) return Object.assign(r, { found: false, why: "no project \"" + r.project + "\" in projects.json" });
    const c = cache || {};
    if (!c[r.project]) {
      const dir = path.resolve(reg[r.project]);
      try { c[r.project] = { epics: read("epics", dir), stories: read("stories", dir), ideas: read("ideas", dir) }; }
      catch (e) { return Object.assign(r, { found: false, why: e.message }); }
    }
    data = c[r.project];
  }
  const hit = (list, type, lane) => {
    const x = (list || []).find(y => y && y.id === r.id);
    return x && Object.assign(r, { found: true, type, name: x.name || x.title || "", lane: x[lane] || "",
      archived: !!x.archived_at });
  };
  return hit(data.epics, "epic", "column") || hit(data.stories, "story", "column") || hit(data.ideas, "idea", "status") ||
    Object.assign(r, { found: false, why: "no such epic, story or idea" + (r.project ? " on " + r.project : "") });
}

/* The registry as ./board capabilities and the MCP tool both give it: every
 * capability in registry order with its derived state and its links
 * resolved to cards and lanes, across boards. Columns are the registered
 * projects, then any other a record names. */
function capabilityReport(name, data) {
  const Q = require("./queue.js");
  const rep = Q.capabilities(data), cache = {};
  const cols = Object.keys(projects());
  rep.projects.forEach(p => { if (!cols.includes(p)) cols.push(p); });
  return {
    project: name, projects: cols, counts: rep.counts,
    capabilities: rep.capabilities.map(c => Object.assign({}, c, {
      links: (Array.isArray(c.links) ? c.links : []).map(l => findCard(l, data, cache)),
    })),
  };
}

module.exports = { projects, resolveDir, findCard, capabilityReport, REGISTRY };
