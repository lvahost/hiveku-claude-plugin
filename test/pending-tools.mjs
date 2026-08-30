/**
 * PENDING_TOOLS — voice-program tool names that are CONTRACTED but not yet in
 * lib/tool-index.json.
 *
 * The 2026-08-29 voice program (see the voice-program tool-name contract)
 * lands ~51 new `voice_*` MCP tools in batches. Plugin prose (skills,
 * commands, agents) is written for the FINAL state, so it names tools before
 * the MCP declarations ship and before the tool index is regenerated. This
 * list is the bridge: `test/tool-names.test.mjs` accepts a voice token that is
 * either in the index or here, and `test/permission-critical.test.mjs` accepts
 * an ask-gated entry whose name is here.
 *
 * ★ Entries MUST be deleted once the regenerated tool-index contains them.
 * That is enforced, not hoped for: tool-names.test.mjs FAILS if any name below
 * appears in lib/tool-index.json, so the regen that delivers a batch also
 * forces its cleanup here. A stale entry cannot linger silently.
 *
 * Shape: name -> { since: 'YYYY-MM-DD', batch: 'A'..'I' } (batches per the
 * contract: A numbers+E911, B 10DLC, C toll-free verification, D porting,
 * E queues, F DNI pools, G SMS ops, H click-to-call, I ops).
 */
export const PENDING_TOOLS = new Map([

  // Batch E — queues (voice_queue_get is declared by the orchestrator but the
  // index has not been regenerated to include it yet, so it is pending too)
]);
