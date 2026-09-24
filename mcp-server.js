#!/usr/bin/env node
/* A stdio MCP server exposing the board's read-side answers as tool calls,
 * for MCP-capable agents (Codex, Cursor, Gemini CLI, …) that don't have a
 * Claude Code Skill to read AGENTS.md and hand-edit JSON. Same two answers
 * board-cli.js gives from a terminal — `status` and `next` — now callable
 * as typed tools instead.
 *
 * Hand-rolled JSON-RPC framing (newline-delimited JSON over stdin/stdout,
 * per the MCP spec) rather than depending on @modelcontextprotocol/sdk:
 * that package pulls in ~90 transitive dependencies (Express, Hono, cors,
 * jose, ajv — a full HTTP/OAuth stack this stdio-only server never touches)
 * for a wire format that's a few hundred lines of vanilla Node. Keeps this
 * repo's "dependencies: none" claim true for the MCP server too, not just
 * the core tool.
 *
 * All judgment lives in queue.js / doctor.js, same as board-cli.js and the
 * UI — this file resolves a project, reads its files, and formats tool
 * results. Phase 1 (status/next) is read-only. Phase 2 adds three
 * low-risk writes — release, needs-human, propose-idea — each a direct
 * field write or append with no ordering rule to enforce, unlike claim/move
 * (still direct JSON edits under PROTOCOL.md §4 — deferred to Phase 3,
 * since those two need to re-derive queue.js's pickability/dependency
 * checks before writing, and getting that wrong could put the board in a
 * state doctor.js would flag as broken).
 */
const Q = require("./queue.js");
const { diagnose, counts } = require("./doctor.js");
const { resolveDir } = require("./resolve.js");
const { read } = require("./read-data.js");
const { writeData } = require("./write-data.js");

const SERVER_NAME = "agent-board";
const SERVER_VERSION = "1.0.0";

// Protocol versions this server understands, newest first — mirrors the
// spec's own negotiation rule: echo the client's version if we support it,
// otherwise fall back to the newest one we do.
const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05", "2024-10-07"];

function load(dir) {
  return {
    config: read("config", dir), epics: read("epics", dir), stories: read("stories", dir),
    ideas: read("ideas", dir), milestones: read("milestones", dir),
  };
}

const PROJECT_PROPERTY = {
  project: {
    type: "string",
    description: "Registered project name from projects.json, or a literal path to a board's data directory. Omit to use the BOARD_DATA_DIR environment variable.",
  },
};

/* ---- tool implementations: same JSON shapes board-cli.js's --json gives ---- */

function toolStatus({ project }) {
  const resolved = resolveDir(project);
  if (!resolved) throw new Error(unresolvedMessage(project));
  const { name, dir } = resolved;
  const data = load(dir);
  const sum = Q.summary(data);
  const dx = counts(diagnose(data));
  const title = (data.config.view || {}).title || name;
  return { project: name, title, ...sum, doctor: dx };
}

function toolNext({ project }) {
  const resolved = resolveDir(project);
  if (!resolved) throw new Error(unresolvedMessage(project));
  const { name, dir } = resolved;
  const data = load(dir);
  const { picks, readyButStuck, wip } = Q.pickable(data);
  const lanes = data.config.lanes || [];
  const workLane = lanes[1] || "the working lane";
  return {
    project: name,
    pickable: picks.map(p => ({
      id: p.story.id, name: p.story.name, epic: p.epic.id, epic_name: p.epic.name,
      priority: p.story.priority, kind: p.story.kind,
      criteria: (p.story.acceptance_criteria || []).length,
    })),
    ready_but_stuck: readyButStuck,
    wip_blocked: wip,
    epic_grain: data.stories.length ? undefined : Q.nextUp(data).picks.map(p => p.epic.id),
    claim_protocol: "AGENTS.md §6: set claimed_by + claimed_at on the story, move it to \"" + workLane + "\", build, verify each acceptance criterion.",
  };
}

function unresolvedMessage(project) {
  return project
    ? "Unknown project: " + project
    : "Which board? Pass a project name (registered in projects.json) or set BOARD_DATA_DIR.";
}

// A ready-to-write id may be an epic (epics.json) or a story (stories.json) —
// find which file it lives in so a write tool knows where to save.
function findRecord(data, id) {
  const epic = data.epics.find(e => e.id === id);
  if (epic) return { key: "epics", list: data.epics, record: epic };
  const story = data.stories.find(s => s.id === id);
  if (story) return { key: "stories", list: data.stories, record: story };
  return null;
}

const nowISO = () => new Date().toISOString();
const todayDate = () => new Date().toISOString().slice(0, 10);

/* ---- Phase 2: low-risk writes — no pickability/ordering rule to enforce ---- */

function toolRelease({ project, id, notes }) {
  const resolved = resolveDir(project);
  if (!resolved) throw new Error(unresolvedMessage(project));
  const { dir } = resolved;
  if (!id) throw new Error("id is required");
  const data = load(dir);
  const found = findRecord(data, id);
  if (!found) throw new Error("Unknown id: " + id);
  const { key, list, record } = found;
  record.claimed_by = null;
  record.claimed_at = null;
  if (typeof notes === "string") record.notes = notes;
  record.updated_at = nowISO();
  writeData(key, list, dir);
  return { id, released: true, notes: record.notes };
}

function toolNeedsHuman({ project, id, kind, reason, clear }) {
  const resolved = resolveDir(project);
  if (!resolved) throw new Error(unresolvedMessage(project));
  const { dir } = resolved;
  if (!id) throw new Error("id is required");
  const data = load(dir);
  const found = findRecord(data, id);
  if (!found) throw new Error("Unknown id: " + id);
  const { key, list, record } = found;
  if (clear) {
    record.needs = null;
  } else {
    if (!reason) throw new Error("reason is required (a specific question, not \"blocked\") unless clear is true");
    record.needs = { kind: kind || "input", reason };
  }
  record.updated_at = nowISO();
  writeData(key, list, dir);
  return { id, needs: record.needs };
}

function toolProposeIdea({ project, title, description, category, theme, priority, context }) {
  const resolved = resolveDir(project);
  if (!resolved) throw new Error(unresolvedMessage(project));
  const { dir } = resolved;
  if (!title) throw new Error("title is required");
  const data = load(dir);
  const defaultPriority = (data.config.priorities && data.config.priorities[0]) || "Now";
  // Same shape and defaults as the UI's blankIdea() (index.html) — an MCP-
  // proposed idea should be indistinguishable from one captured through it.
  const idea = {
    id: "idea-" + Date.now(),
    title, description: description || "", notes: "",
    category: category || "", theme: theme || "", milestone: "", tags: [], deps: [],
    status: "idea", priority: priority || defaultPriority, effort: "", impact: "",
    context: context || "", compounding: "", pros: [], cons: [], sections: [], log: [],
    why_now: "", decision: "", conviction: "", constraints: "", acceptance: "", validation: "",
    promoted_to: null, rejected_reason: null,
    created_at: todayDate(), updated_at: null,
  };
  data.ideas.push(idea);
  writeData("ideas", data.ideas, dir);
  return idea;
}

const TOOLS = [
  {
    name: "status",
    description: "Cold-start orientation on a board: items that need a human, in-flight claims with age/staleness, the pickable count, lane counts, and doctor health. Same as `./board status`.",
    inputSchema: { type: "object", properties: PROJECT_PROPERTY, required: [] },
    handler: toolStatus,
  },
  {
    name: "next",
    description: "The pickable queue, ranked by PROTOCOL.md §3 (priority, then unblock count, then file order), with exclusion reasons. Same as `./board next`.",
    inputSchema: { type: "object", properties: PROJECT_PROPERTY, required: [] },
    handler: toolNext,
  },
  {
    name: "release",
    description: "Release a claim on an epic or story — clears claimed_by/claimed_at. Always safe; use whenever you stop working a card, finished or not (PROTOCOL.md §4 step 7). Optionally record why in notes.",
    inputSchema: {
      type: "object",
      properties: { ...PROJECT_PROPERTY, id: { type: "string", description: "Epic or story id, e.g. \"F1\" or \"F1-2\"." }, notes: { type: "string", description: "Optional explanation, e.g. why work stopped without finishing." } },
      required: ["id"],
    },
    handler: toolRelease,
  },
  {
    name: "needs-human",
    description: "Set or clear the needs field on an epic or story — \"I cannot continue without you.\" Set it the moment you hit a question only a human can answer; clear it the moment the answer arrives (AGENTS.md §2).",
    inputSchema: {
      type: "object",
      properties: {
        ...PROJECT_PROPERTY,
        id: { type: "string", description: "Epic or story id." },
        kind: { type: "string", description: "Free text, e.g. \"decision\", \"author\", \"input\". Defaults to \"input\"." },
        reason: { type: "string", description: "A specific question, not \"blocked\". Required unless clear is true." },
        clear: { type: "boolean", description: "Set true to clear an existing needs flag instead of setting one." },
      },
      required: ["id"],
    },
    handler: toolNeedsHuman,
  },
  {
    name: "propose-idea",
    description: "Capture a new idea into the Ideas funnel (status \"idea\"), same as the UI's \"+ idea\" button. Thin structured write only — developing the idea (context, pros/cons, moving it to \"ready for review\") is a separate conversational activity per AGENTS.md §5, not this tool.",
    inputSchema: {
      type: "object",
      properties: {
        ...PROJECT_PROPERTY,
        title: { type: "string", description: "Short idea title." },
        description: { type: "string" },
        category: { type: "string", description: "Free text, e.g. \"feature\", \"technology\", \"business\"." },
        theme: { type: "string", description: "Must match a config theme, or leave blank." },
        priority: { type: "string", description: "Must match a config priority; defaults to the first (usually \"Now\")." },
        context: { type: "string", description: "What this is really about — problem, for whom, why now." },
      },
      required: ["title"],
    },
    handler: toolProposeIdea,
  },
];

/* ---- JSON-RPC 2.0 over newline-delimited stdio (MCP wire format) ---- */

function send(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

function sendResult(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function handleInitialize(params) {
  const requested = params && params.protocolVersion;
  const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
    ? requested
    : SUPPORTED_PROTOCOL_VERSIONS[0];
  return {
    protocolVersion,
    capabilities: { tools: {} },
    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
  };
}

function handleToolsList() {
  return {
    tools: TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
  };
}

function handleToolsCall(params) {
  const tool = TOOLS.find(t => t.name === (params && params.name));
  if (!tool) throw new Error("Unknown tool: " + (params && params.name));
  try {
    const result = tool.handler((params && params.arguments) || {});
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return { content: [{ type: "text", text: "Error: " + err.message }], isError: true };
  }
}

function handleRequest(id, method, params) {
  try {
    switch (method) {
      case "initialize": return sendResult(id, handleInitialize(params));
      case "ping": return sendResult(id, {});
      case "tools/list": return sendResult(id, handleToolsList());
      case "tools/call": return sendResult(id, handleToolsCall(params));
      default: return sendError(id, -32601, "Method not found: " + method);
    }
  } catch (err) {
    sendError(id, -32603, err.message);
  }
}

function handleMessage(msg) {
  if (msg && typeof msg.id !== "undefined") {
    handleRequest(msg.id, msg.method, msg.params);
  }
  // Notifications (no id) — e.g. notifications/initialized, notifications/cancelled —
  // carry nothing this read-only server needs to act on; ignore them.
}

let buffered = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  buffered += chunk;
  let newlineIndex;
  while ((newlineIndex = buffered.indexOf("\n")) !== -1) {
    const line = buffered.slice(0, newlineIndex).replace(/\r$/, "");
    buffered = buffered.slice(newlineIndex + 1);
    if (!line.trim()) continue;
    let msg;
    try { msg = JSON.parse(line); }
    catch (err) { send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error: " + err.message } }); continue; }
    handleMessage(msg);
  }
});
process.stdin.on("end", () => process.exit(0));
