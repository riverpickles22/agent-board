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

module.exports = { projects, resolveDir, REGISTRY };
