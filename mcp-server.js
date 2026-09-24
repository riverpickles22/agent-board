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
 * results. It is read-only: no tool here writes board data. Claiming,
 * moving, and releasing stay direct JSON edits under AGENTS.md §6, exactly
 * as they are for every other surface today.
 */
const Q = require("./queue.js");
const { diagnose, counts } = require("./doctor.js");
const { resolveDir } = require("./resolve.js");
const { read } = require("./read-data.js");

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
