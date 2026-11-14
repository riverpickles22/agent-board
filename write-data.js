/* Writes one resource file to a project's data directory — pretty-printed
 * with a trailing newline (clean git diffs) and a warning on mangled text
 * (U+FFFD). Shared by server.js's PUT handler and mcp-server.js's write
 * tools, so every write lands in the same byte-for-byte style whether or not
 * server.js is running.
 *
 * Atomic: the JSON goes to a temp file beside the target and is renamed over
 * it, so a reader (an agent, the file watcher, the next GET) sees the old
 * file or the new one, never a half-written one. Returns the new revision
 * (the same hash read-data.js computes) so a caller can hand it back.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { FILES } = require("./defaults.js");
const { revisionOf } = require("./read-data.js");

function writeData(key, value, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const json = JSON.stringify(value, null, 2) + "\n";
  // U+FFFD is what a broken decode leaves behind. No card should ever hold one,
  // so its presence means text was mangled somewhere upstream. Warn rather than
  // refuse: losing an edit is worse than keeping a damaged character, and the
  // line below is what makes the damage findable instead of silent.
  if (json.includes("�")) {
    console.warn(`[warn] ${key}: replacement characters (U+FFFD) in data being written — text was mangled upstream, not by this write`);
  }
  const file = path.join(dir, FILES[key]);
  // Same directory, so the rename never crosses a filesystem. The name is not
  // in the watcher's list of data files, so the temp file never fires a reload.
  const tmp = path.join(dir, "." + FILES[key] + "." + process.pid + "." + crypto.randomBytes(4).toString("hex") + ".tmp");
  const buf = Buffer.from(json, "utf8");
  try {
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) {}
    throw e;
  }
  return revisionOf(buf);
}

module.exports = { writeData };
