/* Reads one resource file from a project's data directory, applying the
 * same empty-scaffold defaults and wrapped-shape handling everywhere a
 * board gets read from. Shared by board-cli.js and mcp-server.js; throws on
 * invalid JSON rather than printing/exiting, so each caller reports the
 * failure its own way (the CLI exits, the MCP server returns a tool error).
 */
const fs = require("fs");
const path = require("path");
const { FILES, DEFAULTS } = require("./defaults.js");

function read(key, dir) {
  const file = path.join(dir, FILES[key]);
  if (!fs.existsSync(file)) return DEFAULTS[key];
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) { throw new Error(FILES[key] + " is not valid JSON — " + e.message); }
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw[key])) return raw[key];   // the wrapped shape
  return raw;
}

module.exports = { read };
