/* Reads one resource file from a project's data directory, applying the
 * same empty-scaffold defaults and wrapped-shape handling everywhere a
 * board gets read from. Shared by server.js, board-cli.js and
 * mcp-server.js; throws on invalid JSON rather than printing/exiting, so
 * each caller reports the failure its own way (the CLI exits, the MCP
 * server returns a tool error, the server answers 500).
 *
 * readRevised() also returns the file's revision: a hash of the exact bytes
 * parsed, taken from the same read so the value and its revision can never
 * describe two different versions of the file. The server hands it to the
 * page and refuses a write based on any other revision (PROTOCOL.md §5).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { FILES, DEFAULTS } = require("./defaults.js");

// A file that does not exist yet has a revision too, so the first write to a
// fresh board is checked like every other.
const ABSENT = "absent";
const revisionOf = (buf) => crypto.createHash("sha1").update(buf).digest("hex").slice(0, 16);

function readRevised(key, dir) {
  const file = path.join(dir, FILES[key]);
  if (!fs.existsSync(file)) return { value: DEFAULTS[key], revision: ABSENT };
  const buf = fs.readFileSync(file);
  let raw;
  try { raw = JSON.parse(buf.toString("utf8")); }
  catch (e) { throw new Error(FILES[key] + " is not valid JSON — " + e.message); }
  const revision = revisionOf(buf);
  if (Array.isArray(raw)) return { value: raw, revision };
  if (raw && Array.isArray(raw[key])) return { value: raw[key], revision };   // the wrapped shape
  return { value: raw, revision };
}

function read(key, dir) { return readRevised(key, dir).value; }

// Only the revision, for a write's precondition check — the bytes on disk
// right now, whatever shape they hold.
function revisionNow(key, dir) {
  const file = path.join(dir, FILES[key]);
  return fs.existsSync(file) ? revisionOf(fs.readFileSync(file)) : ABSENT;
}

module.exports = { read, readRevised, revisionNow, revisionOf };
