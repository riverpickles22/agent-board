#!/usr/bin/env node
/*
 * agent-board — tiny local kanban server (zero dependencies).
 *
 * Serves the board UI and reads/writes JSON files in a project's data
 * directory. Everything is local: binds to 127.0.0.1 only, never phones
 * home. One tool, many projects — point BOARD_DATA_DIR at whichever
 * project's data you're working.
 *
 * Run:   node server.js                          (uses ./data)
 *        BOARD_DATA_DIR=/path/to/project/data node server.js
 * Port:  PORT=5000 node server.js
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const ROOT = __dirname;
const DATA = path.resolve(process.env.BOARD_DATA_DIR || path.join(ROOT, "data"));
const PORT = process.env.PORT || 4300;
const HOST = "127.0.0.1";

// resource name (used in /api/<resource>) → data file.
const FILES = {
  epics: "epics.json",
  stories: "stories.json",
  ideas: "ideas.json",
  config: "config.json",
  milestones: "milestones.json",
};

// Resources whose whole value is an object rather than an array.
const OBJECT_RESOURCES = new Set(["config", "milestones"]);

// Sensible defaults when a project's data dir doesn't have a file yet —
// so a brand-new project can point BOARD_DATA_DIR at an empty directory
// and get a working (empty) board instead of an error.
const DEFAULTS = {
  epics: [],
  stories: [],
  ideas: [],
  config: {
    lanes: ["Backlog", "In Progress", "Review", "Done"],
    priorities: ["Now", "Next", "Later", "Someday"],
    themes: [],
    milestones: [],
    open_gates: [],
    wip_limits: {},
    view: { title: "Board", default_page: "board", default_milestone: "all", default_theme: "all" },
  },
  milestones: { overview: null, milestones: [] },
};

function readData(key) {
  const file = path.join(DATA, FILES[key]);
  if (!fs.existsSync(file)) return DEFAULTS[key];
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function writeData(key, value) {
  fs.mkdirSync(DATA, { recursive: true });
  // Pretty-printed with a trailing newline so git diffs stay clean and reviewable.
  const json = JSON.stringify(value, null, 2) + "\n";
  // U+FFFD is what a broken decode leaves behind. No card should ever hold one,
  // so its presence means text was mangled somewhere upstream. Warn rather than
  // refuse: losing an edit is worse than keeping a damaged character, and the
  // line below is what makes the damage findable instead of silent.
  if (json.includes("\uFFFD")) {
    console.warn(`[warn] ${key}: replacement characters (U+FFFD) in data being written — text was mangled upstream, not by this write`);
  }
  fs.writeFileSync(path.join(DATA, FILES[key]), json);
}

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(body);
}
function sendFile(res, file, type) {
  fs.readFile(path.join(ROOT, file), (err, buf) => {
    if (err) { res.writeHead(404); res.end("Not found"); return; }
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(buf);
  });
}
// Collect bytes and decode once at the end. `data += chunk` decodes each
// chunk on its own, so a multi-byte UTF-8 sequence landing across a chunk
// boundary becomes replacement characters — silently, and as a function of
// where the boundary falls rather than what the text says. It corrupted one
// em-dash in an arc card while three others in the same field survived.
// Counting bytes rather than string length also makes the size cap mean what
// it says.
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    req.on("data", (c) => {
      bytes += c.length;
      if (bytes > 5e6) return req.destroy();
      chunks.push(c);
    });
    req.on("end", () => {
      const data = Buffer.concat(chunks).toString("utf8");
      try { resolve(data ? JSON.parse(data) : null); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

// ---- live reload: watch the data dir, push change events over SSE ----
// Any write to a data file — by this server or an agent editing JSON
// directly — notifies every open page so it refetches instead of holding
// stale state (the old "reload after agent edits" footgun).
const sseClients = new Set();
const WATCHED = new Set(Object.values(FILES));
let watchTimer = null;
function watchData() {
  fs.mkdirSync(DATA, { recursive: true });
  fs.watch(DATA, (event, filename) => {
    if (filename && !WATCHED.has(filename)) return;
    // fs.watch double-fires on most platforms; debounce into one event.
    clearTimeout(watchTimer);
    watchTimer = setTimeout(() => {
      for (const client of sseClients) client.write("data: changed\n\n");
    }, 250);
  });
}

// ---- git as a readable data source ----
// Commits are the ratification record (AGENTS.md §4); these helpers read
// that record — they never write. execFile with an args array: nothing is
// ever interpolated into a shell.
function git(args) {
  return new Promise((resolve) => {
    execFile("git", ["-C", DATA, ...args], { maxBuffer: 10e6 }, (err, stdout) => {
      resolve(err ? null : stdout);
    });
  });
}

// The five data files as parsed JSON at a given commit (DEFAULTS where a
// file didn't exist yet — so brand-new files read as "everything added").
async function snapshotAt(ref) {
  const prefix = ((await git(["rev-parse", "--show-prefix"])) || "").trim();
  const snap = {};
  for (const [key, file] of Object.entries(FILES)) {
    const out = await git(["show", `${ref}:${prefix}${file}`]);
    try { snap[key] = out === null ? DEFAULTS[key] : JSON.parse(out); }
    catch (e) { snap[key] = DEFAULTS[key]; }
  }
  return snap;
}
function workingSnapshot() {
  const snap = {};
  for (const key of Object.keys(FILES)) snap[key] = readData(key);
  return snap;
}

// Card-level change statements between two snapshots — what a human
// reviews at ratify speed ("B1 moved Backlog → Done"), not raw diffs.
// Array order is queue state, so a pure reorder is one statement, not N
// edits; a card that both moved and changed gets one combined statement.
const LANE_FIELD = { epics: "column", stories: "column", ideas: "status" };
function summarizeChanges(oldSnap, newSnap) {
  const statements = [];
  const label = (x) => {
    const l = x.name || x.title || "";
    return l.length > 48 ? l.slice(0, 45) + "…" : l;
  };
  for (const key of ["epics", "stories", "ideas"]) {
    const olds = oldSnap[key] || [], news = newSnap[key] || [];
    const oldBy = new Map(olds.map((x) => [x.id, x]));
    const newBy = new Map(news.map((x) => [x.id, x]));
    const lane = LANE_FIELD[key];
    for (const n of news) {
      if (!oldBy.has(n.id)) {
        statements.push({ resource: key, id: n.id, kind: "added",
          text: `${n.id} '${label(n)}' added (${n[lane] || "?"})` });
        continue;
      }
      const o = oldBy.get(n.id);
      const moved = (o[lane] || "") !== (n[lane] || "");
      const changed = [];
      for (const f of new Set([...Object.keys(o), ...Object.keys(n)])) {
        if (f === lane || f === "updated_at") continue;
        if (JSON.stringify(o[f]) !== JSON.stringify(n[f])) changed.push(f);
      }
      if (moved && changed.length)
        statements.push({ resource: key, id: n.id, kind: "moved+edited",
          text: `${n.id} '${label(n)}' moved ${o[lane]} → ${n[lane]}, edited (${changed.join(", ")})` });
      else if (moved)
        statements.push({ resource: key, id: n.id, kind: "moved",
          text: `${n.id} '${label(n)}' moved ${o[lane]} → ${n[lane]}` });
      else if (changed.length)
        statements.push({ resource: key, id: n.id, kind: "edited",
          text: `${n.id} '${label(n)}' edited (${changed.join(", ")})` });
    }
    for (const o of olds) if (!newBy.has(o.id))
      statements.push({ resource: key, id: o.id, kind: "removed",
        text: `${o.id} '${label(o)}' removed` });
    const beforeOrder = olds.filter((x) => newBy.has(x.id)).map((x) => x.id).join("\n");
    const afterOrder = news.filter((x) => oldBy.has(x.id)).map((x) => x.id).join("\n");
    if (beforeOrder !== afterOrder)
      statements.push({ resource: key, kind: "reordered",
        text: `${key} reordered (queue order changed)` });
  }
  for (const key of ["config", "milestones"]) {
    const o = oldSnap[key] || {}, n = newSnap[key] || {};
    const changed = [...new Set([...Object.keys(o), ...Object.keys(n)])]
      .filter((f) => JSON.stringify(o[f]) !== JSON.stringify(n[f]));
    if (changed.length)
      statements.push({ resource: key, kind: "edited",
        text: `${key} edited (${changed.join(", ")})` });
  }
  return statements;
}

// Uncommitted board changes vs HEAD — what saying "save" would ratify.
async function pendingChanges() {
  if ((await git(["rev-parse", "--git-dir"])) === null)
    return { clean: null, reason: "data dir is not inside a git repository", statements: [], files: [] };
  if ((await git(["rev-parse", "--verify", "HEAD"])) === null)
    return { clean: null, reason: "no commits yet — everything is unratified", statements: [], files: [] };
  const status = await git(["status", "--porcelain", "--", ...Object.values(FILES)]);
  const files = (status || "").split("\n").filter(Boolean).map((l) => l.slice(3).trim());
  if (!files.length) return { clean: true, statements: [], files: [] };
  const statements = summarizeChanges(await snapshotAt("HEAD"), workingSnapshot());
  return { clean: false, files, statements };
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];
  try {
    if (req.method === "GET" && (url === "/" || url === "/index.html")) {
      return sendFile(res, "index.html", "text/html; charset=utf-8");
    }
    // The shared check function, served so the UI runs exactly what the CLI
    // runs. Static asset, not an endpoint — the client already holds the data.
    if (req.method === "GET" && url === "/doctor.js") {
      return sendFile(res, "doctor.js", "text/javascript; charset=utf-8");
    }
    // Capability self-description for agents and humans without repo access:
    // /llms.txt is the emerging agent convention; /docs is the human alias.
    if (req.method === "GET" && (url === "/llms.txt" || url === "/docs")) {
      const type = url === "/docs" ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8";
      return sendFile(res, "CAPABILITIES.md", type);
    }
    // The contract itself, so an agent holding only the URL can read the
    // rules it must follow (CAPABILITIES.md points here by name).
    if (req.method === "GET" && (url === "/AGENTS.md" || url === "/PROTOCOL.md")) {
      return sendFile(res, url.slice(1), "text/markdown; charset=utf-8");
    }
    if (req.method === "GET" && url === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        "Connection": "keep-alive",
      });
      res.write("retry: 2000\n\n");
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }
    if (req.method === "GET" && url === "/api/pending") {
      return sendJSON(res, 200, await pendingChanges());
    }
    // Ratification history: the data dir's commits, newest first — and,
    // per commit, the same card-level statements the pending panel shows,
    // diffed against the commit's parent.
    if (req.method === "GET" && url === "/api/history") {
      if ((await git(["rev-parse", "--git-dir"])) === null)
        return sendJSON(res, 200, { available: false, reason: "data dir is not inside a git repository", commits: [] });
      const raw = await git(["log", "-50", "--format=%H%x1f%cs%x1f%s%x1e", "--", ...Object.values(FILES)]);
      if (raw === null)
        return sendJSON(res, 200, { available: false, reason: "no commits yet — everything is unratified", commits: [] });
      const commits = raw.split("\x1e").map((s) => s.trim()).filter(Boolean).map((entry) => {
        const [hash, date, message] = entry.split("\x1f");
        return { hash, date, message };
      });
      // one extra pass for files touched (name-only log keeps it a single git call)
      const withFiles = await git(["log", "-50", "--format=%x1e%H", "--name-only", "--", ...Object.values(FILES)]);
      const filesBy = {};
      (withFiles || "").split("\x1e").map((s) => s.trim()).filter(Boolean).forEach((block) => {
        const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
        filesBy[lines[0]] = lines.slice(1).map((f) => path.basename(f));
      });
      commits.forEach((c) => { c.files = filesBy[c.hash] || []; });
      return sendJSON(res, 200, { available: true, commits });
    }
    // Briefing: everything that changed between an earlier commit (the
    // client's last-seen marker) and HEAD, plus the current HEAD hash so
    // the client can advance the marker.
    if (req.method === "GET" && url.startsWith("/api/since/")) {
      const hash = url.slice("/api/since/".length);
      if (!/^[0-9a-f]{4,40}$/i.test(hash)) return sendJSON(res, 200, { available: false, reason: "invalid commit hash" });
      const head = ((await git(["rev-parse", "--verify", "HEAD"])) || "").trim();
      if (!head) return sendJSON(res, 200, { available: false, reason: "no commits yet" });
      const resolved = ((await git(["rev-parse", "--verify", hash + "^{commit}"])) || "").trim();
      if (!resolved) return sendJSON(res, 200, { available: false, reason: "unknown commit (history rewritten?)", head });
      const statements = resolved === head ? [] : summarizeChanges(await snapshotAt(resolved), await snapshotAt("HEAD"));
      return sendJSON(res, 200, { available: true, head, statements });
    }
    if (req.method === "GET" && url.startsWith("/api/history/")) {
      const hash = url.slice("/api/history/".length);
      if (!/^[0-9a-f]{4,40}$/i.test(hash)) return sendJSON(res, 400, { error: "invalid commit hash" });
      if ((await git(["cat-file", "-e", hash + "^{commit}"])) === null)
        return sendJSON(res, 404, { error: "unknown commit" });
      // Root commit has no parent — diff against the empty defaults so
      // everything reads as "added".
      const hasParent = (await git(["rev-parse", "--verify", hash + "^"])) !== null;
      const oldSnap = hasParent ? await snapshotAt(hash + "^") : JSON.parse(JSON.stringify(DEFAULTS));
      return sendJSON(res, 200, { hash, statements: summarizeChanges(oldSnap, await snapshotAt(hash)) });
    }
    if (req.method === "GET" && url === "/api/board") {
      return sendJSON(res, 200, {
        epics: readData("epics"),
        stories: readData("stories"),
        ideas: readData("ideas"),
        config: readData("config"),
        milestones: readData("milestones"),
      });
    }
    // Whole-array (or whole-object) writes: the single-user client owns
    // state and sends the full value back.
    if (req.method === "PUT" && url.startsWith("/api/")) {
      const key = url.slice("/api/".length);
      if (FILES[key]) {
        const body = await readBody(req);
        const expectArray = !OBJECT_RESOURCES.has(key);
        if (expectArray && !Array.isArray(body)) return sendJSON(res, 400, { error: "expected a JSON array" });
        if (!expectArray && (typeof body !== "object" || body === null)) return sendJSON(res, 400, { error: "expected a JSON object" });
        writeData(key, body);
        return sendJSON(res, 200, { ok: true, count: expectArray ? body.length : undefined });
      }
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  } catch (err) {
    sendJSON(res, 500, { error: String(err && err.message || err) });
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n  Port ${PORT} is already in use — another board is probably running.`);
    console.error(`  Stop it:                     ./board stop ${PORT}`);
    console.error(`  Or run this one alongside:   PORT=${Number(PORT) + 1} ./board <name>\n`);
    process.exit(1);
  }
  throw err;
});

watchData();

server.listen(PORT, HOST, () => {
  console.log(`\n  agent-board  →  http://localhost:${PORT}\n`);
  console.log(`  data: ${DATA}/ (${Object.values(FILES).join(", ")})`);
  console.log(`  stop: Ctrl+C\n`);
});
