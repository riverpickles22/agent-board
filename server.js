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
 * directory and the URL carries the name as a path prefix (/<name>/#/board), so
 * a link deep-links across boards and the hash router never has to know the
 * project exists.
 *
 * BOARD_DATA_DIR pins the server to one directory and turns the prefix off
 * entirely — the routes stay exactly as they were, which is the contract the
 * Claude skill and every existing bookmark already depend on.
 */
const PINNED = process.env.BOARD_DATA_DIR ? path.resolve(process.env.BOARD_DATA_DIR) : null;
const REGISTRY = path.join(ROOT, "projects.json");
function loadProjects() {
  if (PINNED) return null;
  try {
    const reg = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
    const out = {};
    for (const [name, dir] of Object.entries(reg)) {
      if (/^[a-z0-9][a-z0-9._-]*$/i.test(name)) out[name] = path.resolve(dir);
    }
    return Object.keys(out).length ? out : null;
  } catch (e) { return null; }
}
let PROJECTS = loadProjects();
// Whether the server runs one board or many is decided at start; which boards
// the registry names is not. `./board new` adds a project to projects.json
// while a server is running, so every request checks the file's stamp and
// re-reads it when it changed. A registry caught half-written (or emptied)
// keeps the last good list rather than dropping every board.
const MULTI = PROJECTS !== null;
const registryStamp = () => { try { const st = fs.statSync(REGISTRY); return st.mtimeMs + ":" + st.size; } catch (e) { return "none"; } };
let projectsStamp = registryStamp();
function refreshProjects() {
  if (!MULTI) return;
  const stamp = registryStamp();
  if (stamp === projectsStamp) return;
  projectsStamp = stamp;
  const next = loadProjects();
  if (!next) return;
  PROJECTS = next;
  DEFAULT_PROJECT = defaultProject();
}
// Single-project fallback keeps the historical default of ./data.
const DATA = PINNED || path.join(ROOT, "data");
// `./board <name>` serves everything but says which board you asked for, so
// bare / lands there instead of on whichever project is first in the file.
const OPEN = process.env.BOARD_OPEN || null;
const defaultProject = () => (MULTI
  ? (OPEN && PROJECTS[OPEN] ? OPEN : Object.keys(PROJECTS)[0])
  : null);
let DEFAULT_PROJECT = defaultProject();
const dirFor = (project) => (MULTI ? PROJECTS[project] : DATA);

// Resource names, files, and fresh-board defaults live in defaults.js,
// shared with the `./board new` scaffold — one source for what a project is.
const { FILES, OBJECT_RESOURCES, DEFAULTS } = require("./defaults.js");

// Reads and writes go through the same modules the CLI and the MCP server
// use: one wrapped-shape rule, one byte-for-byte write style, one revision.
// Writes are atomic (temp file + rename) — see write-data.js.
const { read: readShared, readRevised, revisionNow } = require("./read-data.js");
const { writeData: writeShared } = require("./write-data.js");
const readData = (key, dir) => readShared(key, dir || DATA);
const writeData = (key, value, dir) => writeShared(key, value, dir || DATA);

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
// em-dash in one card while three others in the same field survived.
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
  knownSnapshot(dir);
  watchers.set(key, fs.watch(dir, (event, filename) => {
    if (filename && !WATCHED.has(filename)) return;
    // fs.watch double-fires on most platforms; debounce into one event.
    clearTimeout(timer);
    timer = setTimeout(() => {
      // Whatever differs from the last state this server knew is a disk
      // edit; the echo of a page write differs in nothing (the PUT already
      // recorded it), so it is journalled once.
      try { journalChanges(dir, readSnapshot(dir), "disk"); } catch (e) { console.warn("[journal] " + e.message); }
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

// The six data files as parsed JSON at a given commit (DEFAULTS where a
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
// reviews at ratify speed ("B1 moved Ready → Done"), not raw diffs.
// Array order is queue state, so a pure reorder is one statement, not N
// edits; a card that both moved and changed gets one combined statement.
const LANE_FIELD = { epics: "column", stories: "column", ideas: "status" };
function summarizeChanges(oldSnap, newSnap) {
  const statements = [];
  const label = (x) => {
    const l = x.name || x.title || "";
    return l.length > 48 ? l.slice(0, 45) + "…" : l;
  };
  for (const key of ["epics", "stories", "ideas", "capabilities"]) {
    const olds = oldSnap[key] || [], news = newSnap[key] || [];
    const oldBy = new Map(olds.map((x) => [x.id, x]));
    const newBy = new Map(news.map((x) => [x.id, x]));
    const lane = LANE_FIELD[key];
    for (const n of news) {
      if (!oldBy.has(n.id)) {
        statements.push({ resource: key, id: n.id, kind: "added",
          text: `${n.id} '${label(n)}' added` + (lane ? ` (${n[lane] || "?"})` : "") });
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
  // With no commit to diff against there are no statements — but the
  // journal still says what changed here, newest first, each change with
  // its own before-values so the page can undo it.
  const unratified = async (reason) =>
    ({ clean: null, reason, statements: [], files: [], journal: (await readJournal(dir)).slice(-50).reverse() });
  if ((await git(["rev-parse", "--git-dir"], dir)) === null)
    return unratified("data dir is not inside a git repository");
  if ((await git(["rev-parse", "--verify", "HEAD"], dir)) === null)
    return unratified("no commits yet — everything is unratified");
  const status = await git(["status", "--porcelain", "--", ...Object.values(FILES)], dir);
  const files = (status || "").split("\n").filter(Boolean).map((l) => l.slice(3).trim());
  if (!files.length) {
    // Nothing shows as changed and no commit ever held the data files: git
    // ignores them here (agent-board's own roadmap/), so nothing is ratified.
    if (!((await git(["log", "-1", "--format=%H", "--", ...Object.values(FILES)], dir)) || "").trim())
      return unratified("git ignores this board's data files — nothing here is ratified");
    await readJournal(dir);   // trims what the save ratified
    return { clean: true, statements: [], files: [] };
  }
  const head = await snapshotAt("HEAD", dir), working = workingSnapshot(dir);
  const statements = withValues(summarizeChanges(head, working), head, working);
  // Who and when, from the journal: every entry since the last save that
  // touched the statement's card (or, for a reorder or a config/milestones
  // edit, its resource). No entry means the change predates this server.
  const journal = await readJournal(dir);
  for (const s of statements) {
    s.sources = journal
      .filter((e) => e.resource === s.resource && (s.id ? e.id === s.id : !e.id && e.kind === s.kind))
      .map((e) => ({ source: e.source, at: e.at, text: e.text }));
  }
  return { clean: false, files, statements };
}

// ---- the change journal: who and when, between two saves ----
// Git says what a save would ratify; it cannot say where each unsaved change
// came from. The server can, at the one grain it knows: a PUT is a page
// write, and a change the watcher sees that this server did not make is a
// disk edit (an agent, an editor, a script — the server cannot tell which).
// Each change is one line of journal.jsonl in the data dir: the statement
// summarizeChanges() writes, plus the field values before and after, so the
// page can undo exactly that one change. Working state, never ratified
// history: not one of FILES (unwatched, never served by /api/board, never
// scaffolded), kept out of git by the data dir's .gitignore, trimmed to the
// entries since the last commit touching the data files, and capped for a
// board whose data git does not hold.
const JOURNAL = "journal.jsonl";
const JOURNAL_CAP = 300;
const known = new Map();   // data dir -> the last state this server knew it held

// The six resources as parsed now; a file that will not parse (an agent
// mid-edit without an atomic rename) reads as undefined — "unknown, try
// again" — rather than as empty, which would journal every card removed.
function readSnapshot(dir) {
  const snap = {};
  for (const key of Object.keys(FILES)) {
    try { snap[key] = readData(key, dir); } catch (e) { snap[key] = undefined; }
  }
  return snap;
}
function knownSnapshot(dir) {
  dir = dir || DATA;
  if (!known.has(dir)) known.set(dir, readSnapshot(dir));
  return known.get(dir);
}

// Every key two records (or two objects) disagree on, updated_at and the
// lane included, with the values on each side — absent keys left out of
// before/after, so a revert can tell "was absent" from "was null".
function fieldDiff(o, n) {
  const fields = [...new Set([...Object.keys(o || {}), ...Object.keys(n || {})])]
    .filter((f) => JSON.stringify((o || {})[f]) !== JSON.stringify((n || {})[f]));
  const pick = (x) => Object.fromEntries(fields.filter((f) => x && Object.prototype.hasOwnProperty.call(x, f)).map((f) => [f, x[f]]));
  return { fields, before: pick(o), after: pick(n) };
}
// The values behind each statement: enough to restore that one change.
function withValues(statements, oldSnap, newSnap) {
  for (const s of statements) {
    const olds = oldSnap[s.resource], news = newSnap[s.resource];
    if (!Array.isArray(news) || !Array.isArray(olds)) {
      Object.assign(s, fieldDiff(olds, news));
    } else if (s.kind === "reordered") {
      const oldIds = new Set(olds.map((x) => x.id)), newIds = new Set(news.map((x) => x.id));
      s.before = olds.filter((x) => newIds.has(x.id)).map((x) => x.id);
      s.after = news.filter((x) => oldIds.has(x.id)).map((x) => x.id);
    } else if (s.kind === "added") {
      s.after = news.find((x) => x.id === s.id);
    } else if (s.kind === "removed") {
      s.index = olds.findIndex((x) => x.id === s.id);
      s.before = olds[s.index];
    } else {
      Object.assign(s, fieldDiff(olds.find((x) => x.id === s.id), news.find((x) => x.id === s.id)));
    }
  }
  return statements;
}

// Journal what differs between the last known state and `next`, as one
// source, and make `next` the known state. A resource that did not parse
// keeps its last known value and is compared next time.
function journalChanges(dir, next, source) {
  dir = dir || DATA;
  const prev = knownSnapshot(dir);
  const merged = {};
  for (const key of Object.keys(FILES)) merged[key] = next[key] === undefined ? prev[key] : next[key];
  known.set(dir, merged);
  const before = {}, after = {};
  for (const key of Object.keys(FILES)) {
    const both = prev[key] === undefined || merged[key] === undefined;
    before[key] = both ? merged[key] : prev[key];
    after[key] = merged[key];
    if (before[key] === undefined) before[key] = after[key] = DEFAULTS[key];
  }
  const at = new Date().toISOString();
  const entries = withValues(summarizeChanges(before, after), before, after)
    .map((s) => Object.assign({ at, source }, s));
  if (!entries.length) return entries;
  // The journal is a convenience: failing to write it never fails a save.
  try { fs.appendFileSync(path.join(dir, JOURNAL), entries.map((e) => JSON.stringify(e)).join("\n") + "\n"); }
  catch (e) { console.warn("[journal] " + e.message); return entries; }
  readJournal(dir).catch(() => {});   // trims past the last save and the cap
  return entries;
}

// The entries not yet ratified — each newer than the last commit of the data
// file it names (all of them where git holds none) — newest last, at most JOURNAL_CAP; rewrites the
// file when that drops anything. A missing journal is an empty one.
async function readJournal(dir) {
  dir = dir || DATA;
  const file = path.join(dir, JOURNAL);
  if (!fs.existsSync(file)) return [];
  // Per file, because a save may commit one data file and not another: an
  // entry goes only once the file it names has been committed after it.
  const since = {};
  for (const [key, name] of Object.entries(FILES)) {
    const last = ((await git(["log", "-1", "--format=%ct", "--", name], dir)) || "").trim();
    since[key] = last ? Number(last) * 1000 : null;
  }
  const ratified = (e) => since[e.resource] != null && Date.parse(e.at) < since[e.resource];
  // Read after the await, so an append that landed meanwhile is kept.
  let lines;
  try { lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean); } catch (e) { return []; }
  const parsed = lines.map((l) => { try { return JSON.parse(l); } catch (e) { return null; } });
  let kept = parsed.filter((e) => e && !ratified(e));
  if (kept.length > JOURNAL_CAP) kept = kept.slice(-JOURNAL_CAP);
  if (kept.length !== lines.length) {
    const tmp = file + "." + process.pid + ".tmp";
    fs.writeFileSync(tmp, kept.map((e) => JSON.stringify(e)).join("\n") + (kept.length ? "\n" : ""));
    fs.renameSync(tmp, file);
  }
  return kept;
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
  refreshProjects();
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
    if (req.method === "GET" && (url === "/doctor.js" || url === "/queue.js")) {
      return sendFile(res, url.slice(1), "text/javascript; charset=utf-8");
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
      // A board no page is watching has no watcher: catch up on disk edits
      // here, so they are attributed (at the time they were noticed).
      journalChanges(dir, readSnapshot(dir), "disk");
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
      // Saves per day for the calendar above the list: a year of rhythm,
      // not capped at 50 like the entries. Dates only, so it stays small.
      const days = await git(["log", "--since=54 weeks ago", "--format=%cs", "--", ...Object.values(FILES)], dir);
      const perDay = {};
      (days || "").split("\n").map((l) => l.trim()).filter(Boolean).forEach((d) => { perDay[d] = (perDay[d] || 0) + 1; });
      const activity = Object.keys(perDay).sort().map((date) => ({ date, count: perDay[date] }));
      return sendJSON(res, 200, { available: true, commits, activity });
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
    // Each resource carries its revision (a hash of the file's bytes), read in
    // the same pass as its value. A write must name the revision it was based
    // on — see the PUT below.
    if (req.method === "GET" && url === "/api/board") {
      const out = { revisions: {} };
      for (const key of Object.keys(FILES)) {
        const { value, revision } = readRevised(key, dir);
        out[key] = value;
        out.revisions[key] = revision;
      }
      return sendJSON(res, 200, out);
    }
    // Whole-array (or whole-object) writes with a precondition: the client
    // sends the full value plus, in If-Match, the revision it was based on. If
    // the file changed since (an agent edited it while a modal was open), the
    // write is refused with 409 and nothing is written — the page then merges
    // the human's changes onto fresh state and tries again. A PUT that names
    // no revision is refused the same way: a tab still running the old page
    // cannot know what it would overwrite. Check and write are synchronous, so
    // no other request on this server can land between them.
    if (req.method === "PUT" && url.startsWith("/api/")) {
      const key = url.slice("/api/".length);
      if (FILES[key]) {
        const body = await readBody(req);
        const expectArray = !OBJECT_RESOURCES.has(key);
        if (expectArray && !Array.isArray(body)) return sendJSON(res, 400, { error: "expected a JSON array" });
        if (!expectArray && (typeof body !== "object" || body === null)) return sendJSON(res, 400, { error: "expected a JSON object" });
        const based = String(req.headers["if-match"] || "").replace(/^W\//, "").replace(/"/g, "").trim();
        const current = revisionNow(key, dir);
        if (based !== current) {
          return sendJSON(res, 409, {
            error: based ? "stale: " + FILES[key] + " changed since this page loaded it" : "a write must send the revision it is based on (If-Match)",
            revision: current,
          });
        }
        // Disk edits the watcher has not reported yet are the disk's, not
        // this write's; then this write is the page's.
        journalChanges(dir, readSnapshot(dir), "disk");
        const revision = writeData(key, body, dir);
        journalChanges(dir, Object.assign({}, knownSnapshot(dir), { [key]: JSON.parse(JSON.stringify(body)) }), "page");
        return sendJSON(res, 200, { ok: true, count: expectArray ? body.length : undefined, revision });
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
// Every registered board's state as of start, so the first change to one is
// journalled against it rather than becoming the baseline itself.
else for (const d of Object.values(PROJECTS)) if (fs.existsSync(d)) knownSnapshot(d);

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
