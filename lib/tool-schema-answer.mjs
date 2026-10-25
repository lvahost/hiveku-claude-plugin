/**
 * HK-692 (2026-10-25): what a hiveku_tool_schema answer says about calling
 * each tool from THIS session.
 *
 * The MCP server answers hiveku_tool_schema with `available`, and it means
 * "this key and its tool profile may call it". In a plugin session that is not
 * the same as "this session can call it by its own name". Claude Code runs only
 * a tool it was given in tools/list, and this plugin lists a short core set
 * plus what a search promoted (lib/tool-index.mjs), or what a directory focus
 * keeps (lib/tool-focus.mjs). So pm_tasks_comment came back available:true
 * with its full schema, calling mcp__plugin_hiveku_hk__pm_tasks_comment failed
 * with "No such tool available", and the same call worked through
 * hiveku_batch, so every comment went that way.
 *
 * The shim (lib/shim.mjs) now adds every tool the answer reports as available
 * to the session's tool list when it is not there yet, as hiveku_find_tools
 * does, and this module writes the outcome onto each tool in the answer:
 *
 *   callable_directly  true when the tool is in this session's tool list
 *                      (already, or added by this lookup), false otherwise;
 *   how_to_call        the exact way to call it from here.
 *
 * The shim works both out with the function that builds this session's
 * tools/list (advertisedTools), so the answer and the list cannot disagree.
 * STATIC TEXT around tool names only: a name is the one thing taken from the
 * answer, and only a name the server reported in its own `tools` list.
 *
 * Not covered: a hiveku_tool_schema call made as a hiveku_batch member. Its
 * answer is a string inside the batch's own answer, and adds nothing to the
 * list.
 */
import { HIVEKU_TOOL_PREFIX } from './tool-safety.mjs';

export const TOOL_SCHEMA_TOOL = 'hiveku_tool_schema';
const BATCH_TOOL = 'hiveku_batch';

/** A tools/call for hiveku_tool_schema. */
export function isToolSchemaCall(message) {
  return message?.method === 'tools/call' && message?.params?.name === TOOL_SCHEMA_TOOL;
}

/**
 * The report inside a hiveku_tool_schema answer: the server sends one text
 * block holding JSON with a `tools` array. Anything else (an error, a refusal,
 * text that is not JSON) is not a report, and the answer is left as it came.
 */
export function schemaReport(response) {
  const result = response?.result;
  if (!result || typeof result !== 'object' || Array.isArray(result) || result.isError) return null;
  const content = result.content;
  if (!Array.isArray(content) || content.length !== 1) return null;
  const block = content[0];
  if (block?.type !== 'text' || typeof block.text !== 'string') return null;
  let report;
  try {
    report = JSON.parse(block.text);
  } catch {
    return null;
  }
  if (!report || typeof report !== 'object' || Array.isArray(report) || !Array.isArray(report.tools)) return null;
  return report;
}

/** A usable tool name from one entry of the report, or null. */
export function entryName(entry) {
  const name = entry?.name;
  return typeof name === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(name) ? name : null;
}

/** Names the server says this connection may call. */
export function availableNames(report) {
  return report.tools.filter((e) => e?.available === true).map(entryName).filter(Boolean);
}

function batchRoute(name) {
  return `run it through ${BATCH_TOOL} with the same arguments: {"calls":[{"tool":"${name}","args":{...}}]}`;
}

/**
 * callable_directly and how_to_call for one entry, or null to leave it as it
 * came (no usable name, or no boolean `available`).
 *
 * ctx.listed       names in this session's tool list after this lookup
 * ctx.added        names this lookup added to it
 * ctx.listUnknown  the session's tool list could not be read, so nothing was added
 * ctx.findTool     the plugin's own search tool, answered on this machine
 */
export function directCallFacts(entry, { listed, added, listUnknown = false, findTool }) {
  const name = entryName(entry);
  if (!name || typeof entry.available !== 'boolean') return null;
  const direct = `${HIVEKU_TOOL_PREFIX}${name}`;
  const batchListed = listed.has(BATCH_TOOL);

  // The plugin's own search tool: the server cannot see it and says
  // available:false, but whether a session can call it is decided here.
  if (name === findTool) {
    return listed.has(name)
      ? {
          callable_directly: true,
          how_to_call:
            `Call it directly as ${direct}. This plugin answers it on this machine, and every tool it ` +
            "finds that is served to this connection is added to this session's tool list.",
        }
      : {
          callable_directly: false,
          how_to_call:
            "Not in this session's tool list: this folder is set to list its tools without the search. " +
            `Look a tool up with ${TOOL_SCHEMA_TOOL} instead (names, or search for part of a name): a tool ` +
            'that is served to this connection but not listed yet is added.',
        };
  }

  if (!entry.available) {
    return {
      callable_directly: false,
      how_to_call: `This connection cannot call it, directly or through ${BATCH_TOOL}: reason says why.`,
    };
  }

  if (listed.has(name)) {
    return {
      callable_directly: true,
      how_to_call:
        `Call it directly as ${direct}. ` +
        (added.has(name)
          ? "It was not in this session's tool list, so this lookup added it. "
          : "It is in this session's tool list. ") +
        `In Claude Code, load it first with ToolSearch "select:${direct}" if it is deferred.` +
        (batchListed ? ` If a direct call answers "No such tool available", ${batchRoute(name)}.` : ''),
    };
  }

  return {
    callable_directly: false,
    how_to_call:
      (listUnknown
        ? "Not in this session's tool list, and the list could not be read this turn to add it"
        : "Not in this session's tool list, and it cannot be added: this connection's tool list does not include it") +
      ', so a direct call answers "No such tool available". ' +
      (batchListed
        ? `Instead, ${batchRoute(name)}.`
        : `${BATCH_TOOL} is not in this session's tool list either, so it cannot be called from this session.`),
  };
}

/**
 * The answer with callable_directly and how_to_call on every entry that has a
 * usable name and a boolean `available`, placed right after `available`.
 * Everything else in the answer is kept exactly as the server sent it.
 */
export function withDirectCallFacts(response, report, ctx) {
  const tools = report.tools.map((entry) => {
    const facts = directCallFacts(entry, ctx);
    if (!facts) return entry;
    const { name, available, callable_directly: _c, how_to_call: _h, ...rest } = entry;
    return { name, available, ...facts, ...rest };
  });
  const [block] = response.result.content;
  return {
    ...response,
    result: {
      ...response.result,
      content: [{ ...block, text: JSON.stringify({ ...report, tools }) }],
    },
  };
}
