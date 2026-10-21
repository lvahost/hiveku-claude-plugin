/**
 * Answers too large for a chat, and batch answers asked for as a file
 * (HK-341 and HK-346, 2026-10-21). lib/shim.mjs calls this module for every
 * line it writes; lib/data-file.mjs does the writing.
 *
 * ── HK-341: no stdout line above 8 MiB ─────────────────────────────────────
 * The bridge used to forward every answer as ONE stdout line, whatever its
 * size. The builder serves a project_files_bulk_get page of up to 50 MB, the
 * MCP server passes answers up to 64 MiB (and streams a whole
 * project_vcs_checkout tree past that), and escaped once more inside the
 * JSON-RPC envelope such a page is a 55 to 65 MB line. On 2026-10-20 one of
 * them ended a customer's Hiveku connection with no error at all, and the
 * person had to reconnect before any Hiveku tool worked again.
 *
 * So no line this plugin writes to stdout is ever above MAX_STDOUT_LINE_BYTES:
 * 8 MiB, counted in bytes of the serialized JSON-RPC line with its newline.
 * Claude Code keeps about 25k tokens of an answer in the chat and saves the
 * rest to a file of its own, so 8 MiB is far past anything a chat uses and
 * far under what broke. Above it:
 *   - a tools/call answer is saved whole to the bound folder's
 *     hiveku-data/.spill/<tool>-<timestamp>.json (the text the server sent,
 *     byte for byte), and the chat gets a normal tool result
 *     { saved_to, bytes, tool, summary, note }: the summary keeps the small
 *     fields (partial, next_cursor, counts) and gives each list as its length;
 *   - when that file cannot be written (no folder, a symlink, a full disk), the
 *     answer is an isError with code response_too_large_for_client, the size,
 *     and the arguments that ask for less (project_files_bulk_get:
 *     max_total_bytes and the same cursor again);
 *   - anything else over the ceiling becomes a JSON-RPC error. Nothing else
 *     comes close today: tools/list in 'all' mode is about 3 MB.
 *
 * ── HK-346: hiveku_batch with output "file" ─────────────────────────────────
 * A batch answer comes back into the chat with each member cut to
 * max_bytes_per_result (2048 by default), so an agent feeding a script padded
 * every batch with two huge file listings just to make Claude Code save the
 * answer to disk. Only this plugin can write a local file, so the option lives
 * here. `output: "file"` is taken out of the arguments, max_bytes_per_result
 * becomes 32768 (the batch's own ceiling) unless the caller set one, and the
 * call goes upstream like any hiveku_batch: the PreToolUse hook judged every
 * member before the call reached this process, and the PostToolUse ledger
 * (lib/vcs-ledger.mjs) records the members' writes from the tool input. The
 * whole answer is written to hiveku-data/batches/<batch_id>.json and the chat
 * gets { saved_to, batch_id, count, ok_count, failed_count, trimmed }, where
 * trimmed names the labels whose result was cut to that cap or dropped by the
 * batch's size budget. Without a folder that can take the file, the call is
 * refused before anything is sent.
 *
 * File names are built from this module's constants, a sanitized tool name or
 * batch id, and a timestamp (lib/data-file.mjs). Nothing an answer or the
 * arguments contain is ever used as a path.
 */
import {
  BATCH_DIR,
  SPILL_DIR,
  DataFileError,
  fileStamp,
  safeNamePart,
  writeDataFile,
} from './data-file.mjs';

/** The largest line written to stdout, newline included. */
export const MAX_STDOUT_LINE_BYTES = 8 * 1024 * 1024;

export const BATCH_TOOL = 'hiveku_batch';
/** max_bytes_per_result for output "file" when the caller sets none: the batch's own ceiling. */
export const BATCH_FILE_RESULT_BYTES = 32_768;

const BULK_GET = 'project_files_bulk_get';
/** The builder's default page (files-bulk/route.ts DEFAULT_MAX_TOTAL_BYTES) and its floor. */
const BULK_GET_DEFAULT_PAGE = 20 * 1024 * 1024;
const BULK_GET_MIN_PAGE = 64 * 1024;
/** The largest page this plugin suggests: escaped twice, still well under the ceiling. */
const BULK_GET_SUGGESTED_PAGE = 4 * 1024 * 1024;
/** The cap suggested for other tools' answers (_max_bytes, the server's shaping argument). */
const SUGGESTED_MAX_BYTES = 1024 * 1024;

/** Argument names that page or cap an answer, read from a tool's schema or its call. */
const PAGING_ARG_RE = /^(cursor|page|page_size|per_page|page_token|limit|offset|max_results|max_total_bytes|max_bytes)$/;

/** The summary's bounds: a few dozen fields, short strings, never more than 16 KB. */
const SUMMARY_MAX_KEYS = 40;
const SUMMARY_MAX_ENTRIES = 150;
const SUMMARY_MAX_STRING = 300;
const SUMMARY_MAX_BYTES = 16 * 1024;
/**
 * An answer longer than this is saved but not parsed for a summary, to bound
 * memory. A whole project_files_bulk_get page (50 MB at most) is under it.
 */
const SUMMARY_PARSE_LIMIT = 64 * 1024 * 1024;

/** Keys a tool result may carry beside its content without changing what the answer is. */
const RESULT_META_KEYS = new Set(['content', 'isError', '_meta']);

/** The line exactly as the shim writes it. */
export function serializeLine(message) {
  return JSON.stringify(message) + '\n';
}

export function lineBytes(line) {
  return Buffer.byteLength(line, 'utf8');
}

/**
 * The text of a tool result that is one text block (every Hiveku proxy
 * answer: the server's JSON as text), or null for any other shape.
 */
function singleText(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  const content = result.content;
  if (!Array.isArray(content) || content.length !== 1) return null;
  const block = content[0];
  if (!block || block.type !== 'text' || typeof block.text !== 'string') return null;
  if (Object.keys(result).some((key) => !RESULT_META_KEYS.has(key))) return null;
  return block.text;
}

/** Server metadata worth keeping on a replacement answer: small, or not at all. */
function smallMeta(result) {
  const meta = result?._meta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  try {
    return JSON.stringify(meta).length <= 4096 ? { _meta: meta } : {};
  } catch {
    return {};
  }
}

/** A tool result whose one text block is `body` as JSON. */
function toolResult(id, body, { isError = false, meta = {} } = {}) {
  return {
    jsonrpc: '2.0',
    id,
    result: {
      content: [{ type: 'text', text: JSON.stringify(body) }],
      ...(isError ? { isError: true } : {}),
      ...meta,
    },
  };
}

/* ── the summary ─────────────────────────────────────────────────────────── */

function summarizeAt(value, maxDepth) {
  let budget = SUMMARY_MAX_ENTRIES;
  const walk = (v, depth) => {
    if (v === null || typeof v === 'boolean' || typeof v === 'number') return v;
    if (typeof v === 'string') return v.length <= SUMMARY_MAX_STRING ? v : { string_length: v.length };
    if (Array.isArray(v)) return { array_length: v.length };
    if (typeof v !== 'object') return null;
    const keys = Object.keys(v);
    if (depth >= maxDepth || budget <= 0) return { object_keys: keys.length };
    const out = {};
    let shown = 0;
    for (const key of keys) {
      if (budget <= 0 || shown >= SUMMARY_MAX_KEYS) break;
      budget -= 1;
      shown += 1;
      // defineProperty, not `out[key] =`: a key named __proto__ (JSON.parse
      // makes it an own key) would otherwise set the prototype and vanish.
      Object.defineProperty(out, key, { value: walk(v[key], depth + 1), enumerable: true, writable: true, configurable: true });
    }
    if (shown < keys.length) out.more_keys = keys.length - shown;
    return out;
  };
  return walk(value, 0);
}

/**
 * What an answer holds, small enough for the chat: scalars as they are
 * (strings up to 300 characters), every list as `{ array_length }`, objects
 * three levels deep (an answer usually sits under `data`), and never more than
 * 16 KB. Shallower when the deep form is too big.
 */
export function summarizeAnswer(value) {
  for (const depth of [3, 2, 1]) {
    const summary = summarizeAt(value, depth);
    if (Buffer.byteLength(JSON.stringify(summary) ?? '', 'utf8') <= SUMMARY_MAX_BYTES) return summary;
  }
  return { summary_omitted: 'the answer has too many large fields to summarize; read the file' };
}

function summarizeText(text) {
  if (text.length > SUMMARY_PARSE_LIMIT) return { summary_omitted: 'the answer is too large to read here; read the file' };
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { not_json: true };
  }
  return summarizeAnswer(parsed);
}

/* ── file names ──────────────────────────────────────────────────────────── */

let lastStamp = '';
let stampSeq = 0;

/** fileStamp(), with -1, -2 ... for a second file in the same millisecond. */
function uniqueStamp(now) {
  const stamp = fileStamp(now);
  if (stamp === lastStamp) {
    stampSeq += 1;
    return `${stamp}-${stampSeq}`;
  }
  lastStamp = stamp;
  stampSeq = 0;
  return stamp;
}

/* ── HK-341: answers over the ceiling ────────────────────────────────────── */

/**
 * The arguments that ask a tool for less. project_files_bulk_get: a smaller
 * max_total_bytes and the cursor the call sent (null: none, it was the first
 * page), because the page that was too big never arrived and must be asked
 * for again, not skipped. Any other tool: the paging arguments its schema or
 * its call shows, and _max_bytes, the server's own cap on an answer.
 * `schemaProperties` is the tool's declared parameters, or a function that
 * returns them (the shim's lookup, run only here).
 */
export function pagingFor(toolName, args, schemaProperties) {
  const sent = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
  if (toolName === BULK_GET) {
    const asked = Number(sent.max_total_bytes);
    const page = Number.isFinite(asked) && asked > 0 ? asked : BULK_GET_DEFAULT_PAGE;
    return {
      max_total_bytes: Math.max(BULK_GET_MIN_PAGE, Math.min(BULK_GET_SUGGESTED_PAGE, Math.floor(page / 2))),
      cursor: typeof sent.cursor === 'string' && sent.cursor !== '' ? sent.cursor : null,
    };
  }
  const names = new Set();
  const props = typeof schemaProperties === 'function' ? schemaProperties() : schemaProperties;
  const declared = props && typeof props === 'object' ? Object.keys(props) : [];
  for (const name of [...declared, ...Object.keys(sent)]) if (PAGING_ARG_RE.test(name)) names.add(name);
  const paging = {};
  for (const name of [...names].sort()) paging[name] = Object.prototype.hasOwnProperty.call(sent, name) ? sent[name] : null;
  paging._max_bytes = SUGGESTED_MAX_BYTES;
  return paging;
}

const FILE_ERROR_WORDS = {
  no_bound_folder: 'this session has no bound project folder that can be read',
  symlink: 'hiveku-data or a folder in it is a symbolic link, which the plugin never writes through',
  not_a_directory: 'hiveku-data or a folder in it is a file, not a folder',
  bad_name: 'the file name was refused',
  write_failed: 'the disk refused the write',
};

function fileErrorCode(err) {
  return err instanceof DataFileError && FILE_ERROR_WORDS[err.code] ? err.code : 'write_failed';
}

function bulkGetAdvice() {
  return (
    'max_total_bytes caps the optional asset files on a page; code and config files always come whole, ' +
    'so a large file is better read alone with project_file_get. To compare a whole tree, ' +
    'project_files_status gives a sha256 for every file without their contents; for a full local copy, ' +
    'project_files_snapshot gives one archive link.'
  );
}

/** The isError answer when an answer over the ceiling cannot be saved. */
function tooLargeBody({ tool, bytes, args, schemaProperties, fileError }) {
  const code = fileErrorCode(fileError);
  const paging = pagingFor(tool, args, schemaProperties);
  const how = tool === BULK_GET
    ? `Ask for this page again with the arguments in paging: the same cursor (null means none, this was the first page) and max_total_bytes ${paging.max_total_bytes}. ${bulkGetAdvice()}`
    : 'Ask for less at once: the paging arguments in paging if the tool has them, _fields to keep only the fields you need, or _max_bytes, which cuts list items from the end and says how many it left out.';
  return {
    error:
      `This answer was ${bytes} bytes, more than the ${MAX_STDOUT_LINE_BYTES} bytes the Hiveku plugin passes to the ` +
      `chat in one answer, and it could not be saved to a file either: ${FILE_ERROR_WORDS[code]}. Hiveku ran the ` +
      'call and answered; only the answer is missing here. If the call changed something, that change is made: ' +
      `read it back rather than sending the call again. ${how}`,
    code: 'response_too_large_for_client',
    tool,
    bytes,
    ceiling_bytes: MAX_STDOUT_LINE_BYTES,
    paging,
    file_error: code,
  };
}

function spillNote(tool, bytes) {
  return (
    `This answer was ${bytes} bytes, more than the ${MAX_STDOUT_LINE_BYTES} bytes the Hiveku plugin passes to the ` +
    'chat in one answer, so it saved the whole answer to saved_to instead. Read it with a script (jq or node, ' +
    'for example) rather than opening it here: summary shows its small fields and the length of each list.' +
    (tool === BULK_GET
      ? ' When summary says partial is true, its next_cursor is the cursor for the next page. Pages under about ' +
        `${BULK_GET_SUGGESTED_PAGE} bytes (max_total_bytes) stay in the chat. ${bulkGetAdvice()}`
      : '')
  );
}

/**
 * The replacement for a tools/call answer over the ceiling: the file and its
 * summary, or the isError that says how to ask for less.
 */
async function spillToolAnswer(response, { rootDir, toolName, args, schemaProperties, now = new Date() }) {
  const result = response.result;
  const single = singleText(result);
  // One text block is the server's own JSON: saved byte for byte, so a script
  // reads exactly what the server sent. Any other shape is saved whole.
  const text = single ?? JSON.stringify(result);
  const bytes = Buffer.byteLength(text, 'utf8');
  const tool = safeNamePart(toolName, { fallback: 'tool' });
  let saved;
  try {
    saved = await writeDataFile({ rootDir, subdir: SPILL_DIR, fileName: `${tool}-${uniqueStamp(now)}.json`, text });
  } catch (err) {
    return toolResult(response.id, tooLargeBody({ tool, bytes, args, schemaProperties, fileError: err }), { isError: true });
  }
  const body = {
    saved_to: saved.path,
    bytes: saved.bytes,
    tool,
    summary: summarizeText(text),
    note: spillNote(tool, saved.bytes),
  };
  return toolResult(response.id, body, { isError: result.isError === true, meta: smallMeta(result) });
}

/** A JSON-RPC error in place of a message over the ceiling that is not a tool answer. */
export function tooLargeRpcError(id, bytes) {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: -32603,
      message:
        `This answer was ${bytes} bytes, more than the ${MAX_STDOUT_LINE_BYTES} bytes the Hiveku plugin passes ` +
        'to the chat in one message, so it was not sent.',
      data: { code: 'response_too_large_for_client', bytes, ceiling_bytes: MAX_STDOUT_LINE_BYTES },
    },
  };
}

/**
 * The line for any message, never above the ceiling: a response over it
 * becomes tooLargeRpcError, and a notification over it is not written at all
 * (''). The backstop under toolAnswerLine, which handles tool answers first.
 */
export function guardedLine(message) {
  const line = serializeLine(message);
  const bytes = lineBytes(line);
  if (bytes <= MAX_STDOUT_LINE_BYTES) return line;
  const isResponse = message && typeof message === 'object' && Object.prototype.hasOwnProperty.call(message, 'id');
  return isResponse ? serializeLine(tooLargeRpcError(message.id ?? null, bytes)) : '';
}

/**
 * The stdout line for a tools/call answer, never above the ceiling. Under it,
 * the answer is written exactly as it came. `ctx`: { rootDir, toolName, args,
 * schemaProperties, now }.
 */
export async function toolAnswerLine(response, ctx = {}) {
  const text = singleText(response?.result);
  // The case this exists for, answered without serializing it: one text block
  // already longer than the ceiling (a UTF-8 byte count is never below the
  // UTF-16 length, and escaping only adds).
  if (!(typeof text === 'string' && text.length > MAX_STDOUT_LINE_BYTES)) {
    const line = serializeLine(response);
    if (lineBytes(line) <= MAX_STDOUT_LINE_BYTES) return line;
  }
  if (!response?.result || typeof response.result !== 'object') return guardedLine(response);
  return guardedLine(await spillToolAnswer(response, ctx));
}

/* ── HK-346: hiveku_batch with output "file" ─────────────────────────────── */

/**
 * The option as tools/list shows it, added by the shim to the server's
 * hiveku_batch schema (withBatchOutputOption). A parameter, not a sentence in
 * the description: Claude Code cuts a tool description at 2,048 characters
 * and hiveku_batch's is 2,035 already, while a parameter's is shown whole.
 */
export const BATCH_OUTPUT_PROPERTY = Object.freeze({
  type: 'string',
  enum: ['inline', 'file'],
  description:
    'Default "inline": the answer comes back here. "file" (the Hiveku Claude Code plugin): the plugin saves the ' +
    'whole answer, every result as the batch returned it, to hiveku-data/batches/<batch_id>.json in this ' +
    'project folder (git ignores it) and answers only { saved_to, batch_id, count, ok_count, failed_count, ' +
    'trimmed }. Use it when a script will read the results. Each result is still cut at max_bytes_per_result, ' +
    'which is 32768 (the most a batch allows) unless you set it; trimmed lists the labels whose result was cut ' +
    'or dropped, so call those on their own when you need all of it. With no bound project folder that can ' +
    'take the file, the call is refused and nothing runs.',
});

/**
 * tools/list with `output` added to hiveku_batch's schema. A schema that
 * already declares `output` is left as the server wrote it.
 */
export function withBatchOutputOption(tools) {
  if (!Array.isArray(tools)) return tools;
  return tools.map((tool) => {
    if (tool?.name !== BATCH_TOOL) return tool;
    const schema = tool.inputSchema;
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return tool;
    const props = schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
      ? schema.properties
      : {};
    if (Object.prototype.hasOwnProperty.call(props, 'output')) return tool;
    return { ...tool, inputSchema: { ...schema, properties: { ...props, output: { ...BATCH_OUTPUT_PROPERTY } } } };
  });
}

/** A tools/call for hiveku_batch whose arguments say output "file", exactly. */
export function isBatchFileCall(message) {
  const args = message?.params?.arguments;
  return message?.method === 'tools/call' &&
    message?.params?.name === BATCH_TOOL &&
    Boolean(args) && typeof args === 'object' && !Array.isArray(args) &&
    args.output === 'file';
}

/** max_bytes_per_result as the batch would accept it: a positive number, or text of one. */
function callerSetCap(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) && n > 0;
  }
  return false;
}

/**
 * What goes upstream for output "file": `output` taken out, and
 * max_bytes_per_result 32768 unless the caller set one. Nothing else changes:
 * the same tool, the same calls, the same id.
 */
export function batchForwardMessage(message) {
  const { output: _output, ...rest } = message.params.arguments;
  const args = callerSetCap(rest.max_bytes_per_result) ? rest : { ...rest, max_bytes_per_result: BATCH_FILE_RESULT_BYTES };
  return { ...message, params: { ...message.params, arguments: args } };
}

const BATCH_REFUSAL_WORDS = {
  no_bound_folder: 'the bound project folder is missing or cannot be read',
  symlink: 'hiveku-data or hiveku-data/batches is a symbolic link, which the plugin never writes through',
  not_a_directory: 'hiveku-data or hiveku-data/batches is a file, not a folder',
  bad_name: 'the folder name was refused',
  write_failed: 'hiveku-data/batches cannot be created or written',
};

/** The answer when output "file" cannot work in this folder. Sent INSTEAD of the call. */
export function batchFileRefusal(id, err) {
  const reason = err instanceof DataFileError && BATCH_REFUSAL_WORDS[err.code] ? err.code : 'write_failed';
  return toolResult(id, {
    error:
      'output "file" saves the batch answer in this session\'s bound project folder, under ' +
      `hiveku-data/batches/, and that cannot work here: ${BATCH_REFUSAL_WORDS[reason]}. Nothing was sent to Hiveku ` +
      'and nothing ran. Fix the folder, or call hiveku_batch again without output to get the answer in the chat.',
    code: 'output_file_unavailable',
    reason,
    ran: false,
  }, { isError: true });
}

const BATCH_FILE_NOTE =
  'The whole batch answer is in saved_to: read it with a script (jq \'.results[]\', for example). failed_count ' +
  'counts the members with ok false, and each one\'s error.code says why. trimmed lists the labels whose result ' +
  'was cut to max_bytes_per_result or dropped by the batch size budget: call those on their own when you need ' +
  'all of it.';

const INCOMPLETE_NOTE =
  ' incomplete counts members the batch did not finish: one reported batch_member_running may still finish, so ' +
  'check its result before you send it again.';

/** A member's result was cut by a byte cap (this batch's or its own _max_bytes) or dropped by the size budget. */
function wasCut(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.dropped) return true;
  let shaped = entry.result && typeof entry.result === 'object' ? entry.result._shaped : null;
  for (let depth = 0; depth < 4 && shaped && typeof shaped === 'object'; depth++) {
    const cap = shaped.max_bytes;
    if (cap && typeof cap === 'object' && (Boolean(cap.applied) || cap.truncated === true)) return true;
    shaped = shaped.previous;
  }
  return false;
}

const countOf = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

function batchSummary(envelope, saved) {
  const results = envelope.results;
  const count = countOf(envelope.count) ?? results.length;
  const okCount = countOf(envelope.ok_count) ?? results.filter((r) => r?.ok === true).length;
  const failedCount = countOf(envelope.failed_count) ?? count - okCount;
  const labelOf = (entry, index) =>
    (typeof entry?.label === 'string' && entry.label !== '' ? entry.label.slice(0, 200) : String(index));
  const trimmed = [];
  const uncarried = [];
  results.forEach((entry, index) => {
    if (wasCut(entry)) trimmed.push(labelOf(entry, index));
    if (entry && typeof entry === 'object' && entry.uncarried_content) uncarried.push(labelOf(entry, index));
  });
  const incomplete = {};
  if (envelope.incomplete && typeof envelope.incomplete === 'object') {
    for (const key of ['not_started', 'read_cancelled', 'still_running']) {
      if (countOf(envelope.incomplete[key]) !== null) incomplete[key] = envelope.incomplete[key];
    }
  }
  const hasIncomplete = Object.keys(incomplete).length > 0;
  return {
    saved_to: saved.path,
    batch_id: typeof envelope.batch_id === 'string' ? envelope.batch_id.slice(0, 128) : null,
    count,
    ok_count: okCount,
    failed_count: failedCount,
    trimmed,
    ...(envelope.stopped_early === true ? { stopped_early: true } : {}),
    ...(hasIncomplete ? { incomplete } : {}),
    // Content a batch cannot carry at all (an inlined picture): the label,
    // so a reader of `trimmed` alone is not told everything arrived.
    ...(uncarried.length ? { uncarried } : {}),
    note: BATCH_FILE_NOTE + (hasIncomplete ? INCOMPLETE_NOTE : ''),
  };
}

/**
 * The batch ran but its file could not be written: the answer comes back
 * inline, as it would have without output "file", with one sentence ahead of
 * it saying why. The sentence names only an error code and has no braces, so
 * the version ledger still finds the envelope in the text (lib/vcs-ledger.mjs
 * reads from the first `{` to the last `}`).
 */
function inlineFallback(response, err) {
  const code = err instanceof DataFileError ? err.code : 'write_failed';
  const content = Array.isArray(response.result.content) ? response.result.content : [];
  return {
    ...response,
    result: {
      ...response.result,
      content: [
        {
          type: 'text',
          text: `output "file": the batch ran, but its answer could not be saved under hiveku-data/batches/ (${code}), so it is here instead.`,
        },
        ...content,
      ],
    },
  };
}

/**
 * The answer to an output "file" batch. A batch that ran (its envelope has
 * `results`) is written to hiveku-data/batches/<batch_id>.json, byte for byte
 * as the server sent it, and summarized. A batch refused before it ran, or a
 * JSON-RPC error, comes back as it came: there is nothing to save, and the
 * reason belongs in the chat.
 */
export async function batchFileAnswer(response, { rootDir, now = new Date() } = {}) {
  const result = response?.result;
  if (!result || typeof result !== 'object') return response;
  const text = singleText(result);
  let envelope = null;
  if (typeof text === 'string') {
    try {
      envelope = JSON.parse(text);
    } catch {
      envelope = null;
    }
  }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) || !Array.isArray(envelope.results)) {
    return response;
  }
  const stem = typeof envelope.batch_id === 'string' ? safeNamePart(envelope.batch_id, { fallback: '' }) : '';
  let saved;
  try {
    saved = await writeDataFile({ rootDir, subdir: BATCH_DIR, fileName: `${stem || uniqueStamp(now)}.json`, text });
  } catch (err) {
    return inlineFallback(response, err);
  }
  return toolResult(response.id, batchSummary(envelope, saved), {
    isError: result.isError === true,
    meta: smallMeta(result),
  });
}
