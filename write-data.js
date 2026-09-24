/* Writes one resource file to a project's data directory — pretty-printed
 * with a trailing newline (clean git diffs) and a warning on mangled text
 * (U+FFFD), exactly as server.js's PUT handler writes it. Kept here so
 * mcp-server.js's write tools save in the same byte-for-byte style as a
 * write from the running server or the UI, without requiring server.js to
 * be running.
 */
const fs = require("fs");
const path = require("path");
const { FILES } = require("./defaults.js");

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
  fs.writeFileSync(path.join(dir, FILES[key]), json);
}

module.exports = { writeData };
