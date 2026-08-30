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
  // Batch A — numbers + E911
  ['voice_e911_address_create', { since: '2026-08-29', batch: 'A' }],
  ['voice_number_purchase', { since: '2026-08-29', batch: 'A' }],
  ['voice_number_orders_list', { since: '2026-08-29', batch: 'A' }],

  // Batch B — 10DLC completion
  ['voice_sms_campaign_submit', { since: '2026-08-29', batch: 'B' }],
  ['voice_sms_campaign_get', { since: '2026-08-29', batch: 'B' }],
  ['voice_sms_campaign_delete', { since: '2026-08-29', batch: 'B' }],
  ['voice_sms_campaign_appeal', { since: '2026-08-29', batch: 'B' }],
  ['voice_sms_registration_share_link_create', { since: '2026-08-29', batch: 'B' }],
  ['voice_sms_registration_share_links_list', { since: '2026-08-29', batch: 'B' }],
  ['voice_sms_registration_share_link_revoke', { since: '2026-08-29', batch: 'B' }],

  // Batch C — toll-free verification
  ['voice_sms_toll_free_verification_submit', { since: '2026-08-29', batch: 'C' }],

  // Batch D — porting
  ['voice_portability_check', { since: '2026-08-29', batch: 'D' }],
  ['voice_port_order_create', { since: '2026-08-29', batch: 'D' }],
  ['voice_port_order_action', { since: '2026-08-29', batch: 'D' }],
  ['voice_port_order_update', { since: '2026-08-29', batch: 'D' }],
  ['voice_port_order_refresh_status', { since: '2026-08-29', batch: 'D' }],
  ['voice_port_order_share_link_create', { since: '2026-08-29', batch: 'D' }],
  ['voice_port_order_share_links_list', { since: '2026-08-29', batch: 'D' }],
  ['voice_port_order_share_link_revoke', { since: '2026-08-29', batch: 'D' }],
  ['voice_port_order_comments_list', { since: '2026-08-29', batch: 'D' }],
  ['voice_port_order_comment_add', { since: '2026-08-29', batch: 'D' }],
  ['voice_port_order_verification_codes_send', { since: '2026-08-29', batch: 'D' }],
  ['voice_port_order_verification_codes_verify', { since: '2026-08-29', batch: 'D' }],

  // Batch E — queues (voice_queue_get is declared by the orchestrator but the
  // index has not been regenerated to include it yet, so it is pending too)
  ['voice_queue_create', { since: '2026-08-29', batch: 'E' }],
  ['voice_queue_get', { since: '2026-08-29', batch: 'E' }],

  // Batch F — DNI pools
  ['voice_pool_create', { since: '2026-08-29', batch: 'F' }],
  ['voice_pool_get', { since: '2026-08-29', batch: 'F' }],
  ['voice_pool_update', { since: '2026-08-29', batch: 'F' }],
  ['voice_pool_delete', { since: '2026-08-29', batch: 'F' }],
  ['voice_pool_numbers_list', { since: '2026-08-29', batch: 'F' }],
  ['voice_pool_numbers_add', { since: '2026-08-29', batch: 'F' }],
  ['voice_pool_numbers_remove', { since: '2026-08-29', batch: 'F' }],
  ['voice_pool_e911_apply', { since: '2026-08-29', batch: 'F' }],
  ['voice_phone_tracking_config_get', { since: '2026-08-29', batch: 'F' }],
  ['voice_phone_tracking_config_set', { since: '2026-08-29', batch: 'F' }],
  ['voice_phone_tracking_config_delete', { since: '2026-08-29', batch: 'F' }],
  ['voice_swap_test', { since: '2026-08-29', batch: 'F' }],

  // Batch G — SMS ops
  ['voice_sms_bulk_send', { since: '2026-08-29', batch: 'G' }],
  ['voice_sms_scheduled_list', { since: '2026-08-29', batch: 'G' }],
  ['voice_sms_scheduled_cancel', { since: '2026-08-29', batch: 'G' }],
  ['voice_sms_messaging_profile_attach', { since: '2026-08-29', batch: 'G' }],

  // Batch H — click-to-call
  ['voice_call_originate', { since: '2026-08-29', batch: 'H' }],

  // Batch I — ops
  ['voice_webhooks_list', { since: '2026-08-29', batch: 'I' }],
  ['voice_webhook_create', { since: '2026-08-29', batch: 'I' }],
  ['voice_webhook_update', { since: '2026-08-29', batch: 'I' }],
  ['voice_webhook_delete', { since: '2026-08-29', batch: 'I' }],
  ['voice_ai_agent_config_get', { since: '2026-08-29', batch: 'I' }],
  ['voice_ai_agent_config_update', { since: '2026-08-29', batch: 'I' }],
  ['voice_tts_preview', { since: '2026-08-29', batch: 'I' }],
  ['voice_ivrs_reprovision', { since: '2026-08-29', batch: 'I' }],
  ['voice_tenant_repair', { since: '2026-08-29', batch: 'I' }],
]);
