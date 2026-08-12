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
const PORT = process.env.PORT || 4300;
const HOST = "127.0.0.1";

/* ---- projects ----
 * One server, every registered board. `projects.json` maps a name to a data
 * directory and the URL carries the name as a path prefix (/arc/#/board), so
 * a link deep-links across boards and the hash router never has to know the
 * project exists.
 *
 * BOARD_DATA_DIR pins the server to one directory and turns the prefix off
 * entirely — the routes stay exactly as they were, which is the contract the
 * Claude skill and every existing bookmark already depend on.
 */
const PINNED = process.env.BOARD_DATA_DIR ? path.resolve(process.env.BOARD_DATA_DIR) : null;
function loadProjects() {
  if (PINNED) return null;
  try {
    const reg = JSON.parse(fs.readFileSync(path.join(ROOT, "projects.json"), "utf8"));
    const out = {};
    for (const [name, dir] of Object.entries(reg)) {
      if (/^[a-z0-9][a-z0-9._-]*$/i.test(name)) out[name] = path.resolve(dir);
    }
    return Object.keys(out).length ? out : null;
  } catch (e) { return null; }
}
const PROJECTS = loadProjects();
const MULTI = PROJECTS !== null;
// Single-project fallback keeps the historical default of ./data.
const DATA = PINNED || path.join(ROOT, "data");
// `./board <name>` serves everything but says which board you asked for, so
// bare / lands there instead of on whichever project is first in the file.
const OPEN = process.env.BOARD_OPEN || null;
const DEFAULT_PROJECT = MULTI
  ? (OPEN && PROJECTS[OPEN] ? OPEN : Object.keys(PROJECTS)[0])
  : null;
const dirFor = (project) => (MULTI ? PROJECTS[project] : DATA);

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

function readData(key, dir) {
  const file = path.join(dir || DATA, FILES[key]);
  if (!fs.existsSync(file)) return DEFAULTS[key];
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function writeData(key, value, dir) {
  dir = dir || DATA;
  fs.mkdirSync(dir, { recursive: true });
  // Pretty-printed with a trailing newline so git diffs stay clean and reviewable.
  const json = JSON.stringify(value, null, 2) + "\n";
  // U+FFFD is what a broken decode leaves behind. No card should ever hold one,
  // so its presence means text was mangled somewhere upstream. Warn rather than
  // refuse: losing an edit is worse than keeping a damaged character, and the
  // line below is what makes the damage findable instead of silent.
  if (json.includes("\uFFFD")) {
    console.warn(`[warn] ${key}: replacement characters (U+FFFD) in data being written — text was mangled upstream, not by this write`);
  }
  fs.writeFileSync(path.join(dir, FILES[key]), json);
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
const WATCHED = new Set(Object.values(FILES));
// One client set and one watcher per project, both created on demand: a
// registry of ten projects should not open ten watchers for the one board
// someone is actually looking at.
const sseByProject = new Map();
const watchers = new Map();
function clientsFor(project) {
  const key = project || "";
  if (!sseByProject.has(key)) sseByProject.set(key, new Set());
  return sseByProject.get(key);
}
function watchData(project) {
  const key = project || "";
  if (watchers.has(key)) return;
  const dir = dirFor(project);
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  let timer = null;
  watchers.set(key, fs.watch(dir, (event, filename) => {
    if (filename && !WATCHED.has(filename)) return;
    // fs.watch double-fires on most platforms; debounce into one event.
    clearTimeout(timer);
    timer = setTimeout(() => {
      for (const client of clientsFor(project)) client.write("data: changed\n\n");
    }, 250);
  }));
}

// ---- git as a readable data source ----
// Commits are the ratification record (AGENTS.md §4); these helpers read
// that record — they never write. execFile with an args array: nothing is
// ever interpolated into a shell.
function git(args, dir) {
  return new Promise((resolve) => {
    execFile("git", ["-C", dir || DATA, ...args], { maxBuffer: 10e6 }, (err, stdout) => {
      resolve(err ? null : stdout);
    });
  });
}

// The five data files as parsed JSON at a given commit (DEFAULTS where a
// file didn't exist yet — so brand-new files read as "everything added").
async function snapshotAt(ref, dir) {
  const prefix = ((await git(["rev-parse", "--show-prefix"], dir)) || "").trim();
  const snap = {};
  for (const [key, file] of Object.entries(FILES)) {
    const out = await git(["show", `${ref}:${prefix}${file}`], dir);
    try { snap[key] = out === null ? DEFAULTS[key] : JSON.parse(out); }
    catch (e) { snap[key] = DEFAULTS[key]; }
  }
  return snap;
}
function workingSnapshot(dir) {
  const snap = {};
  for (const key of Object.keys(FILES)) snap[key] = readData(key, dir);
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
async function pendingChanges(dir) {
  if ((await git(["rev-parse", "--git-dir"], dir)) === null)
    return { clean: null, reason: "data dir is not inside a git repository", statements: [], files: [] };
  if ((await git(["rev-parse", "--verify", "HEAD"], dir)) === null)
    return { clean: null, reason: "no commits yet — everything is unratified", statements: [], files: [] };
  const status = await git(["status", "--porcelain", "--", ...Object.values(FILES)], dir);
  const files = (status || "").split("\n").filter(Boolean).map((l) => l.slice(3).trim());
  if (!files.length) return { clean: true, statements: [], files: [] };
  const statements = summarizeChanges(await snapshotAt("HEAD", dir), workingSnapshot(dir));
  return { clean: false, files, statements };
}

/* Split an optional leading /<project> off a request path. In single-project
 * mode there is nothing to split and every URL means what it always meant. */
function routeOf(rawUrl) {
  const url = rawUrl.split("?")[0];
  if (!MULTI) return { project: null, url };
  const m = url.match(/^\/([^/]+)(\/.*)?$/);
  if (m && Object.prototype.hasOwnProperty.call(PROJECTS, m[1]))
    return { project: m[1], url: m[2] || "/" };
  return { project: null, url };
}

const server = http.createServer(async (req, res) => {
  const { project, url } = routeOf(req.url);
  const dir = dirFor(project);
  try {
    // The registry itself, so the client can draw the switcher and know which
    // board it is looking at without being told twice.
    if (req.method === "GET" && url === "/api/projects") {
      return sendJSON(res, 200, {
        multi: MULTI,
        current: project,
        default: DEFAULT_PROJECT,
        // The footer has always claimed "./data"; tell it the truth.
        dir: dirFor(project) || DATA,
        projects: MULTI
          ? Object.entries(PROJECTS).map(([name, d]) => ({ name, available: fs.existsSync(d) }))
          : [],
      });
    }
    // A bare / with a registry has no project to serve, so it sends you to
    // the default one rather than guessing per request.
    if (req.method === "GET" && MULTI && !project && (url === "/" || url === "/index.html")) {
      res.writeHead(302, { Location: "/" + DEFAULT_PROJECT + "/" });
      return res.end();
    }
    // /<project> without the slash would make the page's relative asset URLs
    // resolve against / instead of /<project>/.
    if (req.method === "GET" && project && url === "/" && !req.url.split("?")[0].endsWith("/")) {
      res.writeHead(302, { Location: "/" + project + "/" });
      return res.end();
    }
    if (req.method === "GET" && (url === "/" || url === "/index.html")) {
      return sendFile(res, "index.html", "text/html; charset=utf-8");
    }
    if (req.method === "GET" && MULTI && !project && url.startsWith("/api/") && url !== "/api/projects") {
      return sendJSON(res, 404, { error: "no project in the path — try /" + DEFAULT_PROJECT + url });
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
      watchData(project);
      clientsFor(project).add(res);
      req.on("close", () => clientsFor(project).delete(res));
      return;
    }
    if (req.method === "GET" && url === "/api/pending") {
      return sendJSON(res, 200, await pendingChanges(dir));
    }
    // Ratification history: the data dir's commits, newest first — and,
    // per commit, the same card-level statements the pending panel shows,
    // diffed against the commit's parent.
    if (req.method === "GET" && url === "/api/history") {
      if ((await git(["rev-parse", "--git-dir"], dir)) === null)
        return sendJSON(res, 200, { available: false, reason: "data dir is not inside a git repository", commits: [] });
      const raw = await git(["log", "-50", "--format=%H%x1f%cs%x1f%s%x1e", "--", ...Object.values(FILES)], dir);
      if (raw === null)
        return sendJSON(res, 200, { available: false, reason: "no commits yet — everything is unratified", commits: [] });
      const commits = raw.split("\x1e").map((s) => s.trim()).filter(Boolean).map((entry) => {
        const [hash, date, message] = entry.split("\x1f");
        return { hash, date, message };
      });
      // one extra pass for files touched (name-only log keeps it a single git call)
      const withFiles = await git(["log", "-50", "--format=%x1e%H", "--name-only", "--", ...Object.values(FILES)], dir);
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
      const head = ((await git(["rev-parse", "--verify", "HEAD"], dir)) || "").trim();
      if (!head) return sendJSON(res, 200, { available: false, reason: "no commits yet" });
      const resolved = ((await git(["rev-parse", "--verify", hash + "^{commit}"], dir)) || "").trim();
      if (!resolved) return sendJSON(res, 200, { available: false, reason: "unknown commit (history rewritten?)", head });
      const statements = resolved === head ? [] : summarizeChanges(await snapshotAt(resolved, dir), await snapshotAt("HEAD", dir));
      return sendJSON(res, 200, { available: true, head, statements });
    }
    if (req.method === "GET" && url.startsWith("/api/history/")) {
      const hash = url.slice("/api/history/".length);
      if (!/^[0-9a-f]{4,40}$/i.test(hash)) return sendJSON(res, 400, { error: "invalid commit hash" });
      if ((await git(["cat-file", "-e", hash + "^{commit}"], dir)) === null)
        return sendJSON(res, 404, { error: "unknown commit" });
      // Root commit has no parent — diff against the empty defaults so
      // everything reads as "added".
      const hasParent = (await git(["rev-parse", "--verify", hash + "^"], dir)) !== null;
      const oldSnap = hasParent ? await snapshotAt(hash + "^", dir) : JSON.parse(JSON.stringify(DEFAULTS));
      return sendJSON(res, 200, { hash, statements: summarizeChanges(oldSnap, await snapshotAt(hash, dir)) });
    }
    if (req.method === "GET" && url === "/api/board") {
      return sendJSON(res, 200, {
        epics: readData("epics", dir),
        stories: readData("stories", dir),
        ideas: readData("ideas", dir),
        config: readData("config", dir),
        milestones: readData("milestones", dir),
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
        writeData(key, body, dir);
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

// Single-project mode watches immediately; multi-project waits for a client
// to say which board it is looking at.
if (!MULTI) watchData(null);

server.listen(PORT, HOST, () => {
  console.log(`\n  agent-board  →  http://localhost:${PORT}\n`);
  if (MULTI) {
    console.log(`  ${Object.keys(PROJECTS).length} projects (projects.json):`);
    for (const [name, d] of Object.entries(PROJECTS)) {
      const gone = fs.existsSync(d) ? "" : "   (MISSING)";
      console.log(`    http://localhost:${PORT}/${name}/`.padEnd(42) + d + gone);
    }
    console.log(`\n  default: /${DEFAULT_PROJECT}/   ·   pin one board: BOARD_DATA_DIR=<dir> node server.js`);
  } else {
    console.log(`  data: ${DATA}/ (${Object.values(FILES).join(", ")})`);
  }
  console.log(`  stop: Ctrl+C\n`);
});
