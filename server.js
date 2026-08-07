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
  fs.writeFileSync(path.join(DATA, FILES[key]), JSON.stringify(value, null, 2) + "\n");
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
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 5e6) req.destroy(); });
    req.on("end", () => { try { resolve(data ? JSON.parse(data) : null); } catch (e) { reject(e); } });
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

const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];
  try {
    if (req.method === "GET" && (url === "/" || url === "/index.html")) {
      return sendFile(res, "index.html", "text/html; charset=utf-8");
    }
    // Capability self-description for agents and humans without repo access:
    // /llms.txt is the emerging agent convention; /docs is the human alias.
    if (req.method === "GET" && (url === "/llms.txt" || url === "/docs")) {
      const type = url === "/docs" ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8";
      return sendFile(res, "CAPABILITIES.md", type);
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
    console.error(`  Run the second board on another port:  PORT=${Number(PORT) + 1} ./board <name>\n`);
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
