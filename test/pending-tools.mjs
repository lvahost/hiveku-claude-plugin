/**
 * PENDING_TOOLS: tool names that are CONTRACTED but not yet in
 * lib/tool-index.json.
 *
 * Plugin prose (skills, commands, agents) is written for the FINAL state of a
 * program, so it can name a tool before the MCP declaration ships and before
 * the tool index is regenerated. This list is the bridge:
 * `test/tool-names.test.mjs` accepts a gated-prefix token that is either in the
 * index or here, and `test/permission-critical.test.mjs` accepts an ask-gated
 * entry whose name is here.
 *
 * ★ Entries MUST be deleted once the regenerated tool-index contains them.
 * That is enforced, not hoped for: tool-names.test.mjs FAILS if any name below
 * appears in lib/tool-index.json, so the regen that delivers a batch also
 * forces its cleanup here. A stale entry cannot linger silently.
 *
 * ★ An INCOMING name is spelled in exactly ONE reference file's Availability
 * table (plus here). Everywhere else prose refers to the capability by
 * description and points at that file, so a rename before shipping is one edit.
 *
 * Shape: name -> { since: 'YYYY-MM-DD', batch }.
 *
 * Batches:
 *   Voice program (2026-08-29): 'A'..'I' (A numbers+E911, B 10DLC, C toll-free
 *   verification, D porting, E queues, F DNI pools, G SMS ops, H click-to-call,
 *   I ops). Every voice batch has landed; nothing from it is pending today.
 *
 *   SEO program (2026-08-30, Waves B/C of the SEO teaching plan; the INCOMING
 *   table in the program contract is the source of these names):
 *     S1  tracked-keyword read/update and tracking-project get/update/delete
 *     S2  competitor get/update/delete, keyword-cluster and topic-cluster
 *         get/update/delete, the manual backlink tracker CRUD, backlink
 *         opportunity CRUD
 *     S3  connection get / test / health, GA4 property discovery, automated
 *         report get/update/delete, the implement-rail diff reader
 *     S4  llms.txt generator, AI visibility, the issues feed, organic leads
 *     S5  rank-lane platforms set, GBP posts reader, listings get/scan, the
 *         permanent GSC query-page archive reader, per-page SEO get/set and
 *         per-page schema get/set/delete
 */
const SEO_SINCE = '2026-08-30';
const seo = (batch) => ({ since: SEO_SINCE, batch });

export const PENDING_TOOLS = new Map([
  // S1
  ['seo_tracked_keyword_get', seo('S1')],
  ['seo_tracked_keyword_update', seo('S1')],
  ['seo_tracking_project_get', seo('S1')],
  ['seo_tracking_project_update', seo('S1')],
  ['seo_tracking_project_delete', seo('S1')],

  // S2
  ['seo_competitor_get', seo('S2')],
  ['seo_competitor_update', seo('S2')],
  ['seo_competitor_delete', seo('S2')],
  ['seo_keyword_cluster_get', seo('S2')],
  ['seo_keyword_cluster_update', seo('S2')],
  ['seo_keyword_cluster_delete', seo('S2')],
  ['seo_topic_cluster_get', seo('S2')],
  ['seo_topic_cluster_update', seo('S2')],
  ['seo_topic_cluster_delete', seo('S2')],
  ['seo_backlink_tracker_list', seo('S2')],
  ['seo_backlink_tracker_add', seo('S2')],
  ['seo_backlink_tracker_get', seo('S2')],
  ['seo_backlink_tracker_update', seo('S2')],
  ['seo_backlink_tracker_delete', seo('S2')],
  ['seo_backlink_opportunity_create', seo('S2')],
  ['seo_backlink_opportunity_get', seo('S2')],
  ['seo_backlink_opportunity_update', seo('S2')],
  ['seo_backlink_opportunity_delete', seo('S2')],

  // S3
  ['seo_connection_get', seo('S3')],
  // seo_connection_test: the orient skill's integrations.md still says this
  // tool "does not exist" (true today); it is contracted in S3 and WRITES
  // connection_status, so it lives here rather than in KNOWN_NON_TOOLS.
  ['seo_connection_test', seo('S3')],
  ['seo_connections_health', seo('S3')],
  ['seo_analytics_discover_properties', seo('S3')],
  ['seo_automated_report_get', seo('S3')],
  ['seo_automated_report_update', seo('S3')],
  ['seo_automated_report_delete', seo('S3')],
  ['seo_task_changes', seo('S3')],

  // S4
  ['seo_llms_txt_generate', seo('S4')],
  ['seo_ai_visibility', seo('S4')],
  ['seo_issues', seo('S4')],
  ['seo_organic_leads', seo('S4')],

  // S5
  ['seo_rankings_platforms_set', seo('S5')],
  ['seo_gbp_posts', seo('S5')],
  ['seo_listings_get', seo('S5')],
  ['seo_listings_scan', seo('S5')],
  ['seo_query_page_metrics', seo('S5')],
  ['seo_page_seo_get', seo('S5')],
  ['seo_page_seo_set', seo('S5')],
  ['seo_page_schema_get', seo('S5')],
  ['seo_page_schema_set', seo('S5')],
  ['seo_page_schema_delete', seo('S5')],
]);
