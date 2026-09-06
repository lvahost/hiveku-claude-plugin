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
 *
 *   Working-branch program (2026-09-02, the branch-parameter model across the
 *   MCP file/build/preview tools):
 *     VCS-1  project_vcs_diff_file and project_vcs_revert. Landed in the live
 *            index on 2026-09-03; entries deleted.
 *
 *   Form attachments program (2026-09-03, file uploads on captured forms):
 *     FA-1  marketing_form_attachments_list, marketing_form_attachment_download_url,
 *           marketing_form_upload_settings_get, marketing_form_upload_settings_update.
 *           Landed in the live index on 2026-09-03; entries deleted.
 *
 *   Creative media program (2026-09-03, the designer's media hands): media_import_url,
 *   media_transform, media_upscale, media_image_quota were already live when the
 *   index was regenerated, so they never needed a bridge entry.
 *
 *   Social program (2026-09-03, the social department's new MCP hands: the
 *   dry-run validator, the per-platform preview, the post-analytics and
 *   by-dimension readers, the calendar-gap finder, the comments digest, the
 *   repurpose-source reader, duplicate, retry, bulk-create, the recent-comments
 *   sync and the hashtag bulk upsert). Mapped in the MCP server working tree
 *   (src/tools/olympus-tools.ts) and named by the social skill, commands and
 *   agent before the index regenerates after the MCP deploy:
 *     SOCIAL-1  social_post_validate, social_post_preview,
 *               social_posts_analytics_list, social_analytics_by_dimension,
 *               social_calendar_gaps, social_comments_digest,
 *               social_repurpose_source, social_post_duplicate,
 *               social_posts_bulk_create, social_post_retry,
 *               social_comments_sync_recent, social_hashtags_bulk_upsert.
 *               social_post_retry is also on the ask list
 *               (data/permission-critical-tools.json), which is why that file's
 *               test accepts a PENDING name.
 *
 *   Webflow program (2026-09-05, the web department's Webflow Data API hands,
 *   generated one tool per builder action by the MCP server's
 *   scripts/gen-webflow-tools.py). Mapped in the MCP server working tree
 *   (src/tools/webflow-tools.ts) before the index regenerates after the MCP
 *   deploy:
 *     WEBFLOW-1  webflow_site_publish, webflow_cms_item_delete, cms_publish.
 *                All three are on the ask list
 *                (data/permission-critical-tools.json): the publishes push
 *                staged changes live and delete destroys a staged CMS item
 *                with no restore, so the ask-list test accepts them as
 *                PENDING names until the index carries them. cms_publish is
 *                the provider-seam tool (cmsTools in olympus-tools.ts) that
 *                publishes items written through the generic cms_* tools on
 *                a Webflow-backed project.
 *     WEBFLOW-2  the 81 tools the family modules added (page content and
 *                custom code, components, collection schema, item extensions,
 *                assets, site custom code and the Hiveku snippet composites,
 *                Google tags, forms, webhooks, comments, ecommerce, redirects,
 *                robots, well-known files, the activity log). Sixteen of them
 *                are on the ask list; the rest are here so the web skill and
 *                commands can name them before the index carries them.
 */
const SEO_SINCE = '2026-08-30';
const seo = (batch) => ({ since: SEO_SINCE, batch });

export const PENDING_TOOLS = new Map([
  // S1

  // S2

  // S3
  // seo_connection_test: the orient skill's integrations.md still says this
  // tool "does not exist" (true today); it is contracted in S3 and WRITES
  // connection_status, so it lives here rather than in KNOWN_NON_TOOLS.

  // S4

  // S5

  // VCS-1: landed 2026-09-03, nothing pending.

  // FA-1: landed 2026-09-03, nothing pending.

  // SOCIAL-1: landed in the live index on 2026-09-03 (MCP d322d74), entries deleted.

  // WEBFLOW-1
  ['webflow_site_publish', { since: '2026-09-05', batch: 'WEBFLOW-1' }],
  ['webflow_cms_item_delete', { since: '2026-09-05', batch: 'WEBFLOW-1' }],
  // cms_publish: the generic CMS publish for a Webflow-backed project
  // (Phase 4 provider seam, src/tools/olympus-tools.ts cmsTools). On the ask
  // list because it puts staged items, and optionally the whole site, on the
  // customer's live Webflow site.
  ['cms_publish', { since: '2026-09-05', batch: 'WEBFLOW-1' }],
  // WEBFLOW-2: one entry per generated tool, in the module order of the
  // builder's dispatch merge (page content, components, fields, item
  // extensions, assets, custom code, Google tags, forms, webhooks, comments,
  // ecommerce, redirects, robots, well-known, activity).
  ...[
    'webflow_page_dom_get',
    'webflow_page_dom_update',
    'webflow_page_customcode_get',
    'webflow_page_customcode_set',
    'webflow_page_customcode_delete',
    'webflow_component_list',
    'webflow_component_content_get',
    'webflow_component_content_update',
    'webflow_component_properties_get',
    'webflow_component_properties_update',
    'webflow_cms_collection_create',
    'webflow_cms_collection_update',
    'webflow_cms_collection_delete',
    'webflow_cms_field_create',
    'webflow_cms_field_update',
    'webflow_cms_field_delete',
    'webflow_cms_item_query',
    'webflow_cms_item_update_bulk',
    'webflow_cms_item_delete_bulk',
    'webflow_cms_item_unpublish_bulk',
    'webflow_asset_list',
    'webflow_asset_get',
    'webflow_asset_upload',
    'webflow_asset_update',
    'webflow_asset_delete',
    'webflow_asset_folder_list',
    'webflow_asset_folder_create',
    'webflow_script_list',
    'webflow_script_register_hosted',
    'webflow_script_register_inline',
    'webflow_site_customcode_get',
    'webflow_site_customcode_set',
    'webflow_site_customcode_delete',
    'webflow_customcode_blocks_list',
    'webflow_hiveku_snippet_install',
    'webflow_hiveku_snippet_remove',
    'webflow_google_tag_list',
    'webflow_google_tag_upsert',
    'webflow_google_tag_delete',
    'webflow_form_list',
    'webflow_form_get',
    'webflow_form_submission_list',
    'webflow_form_submission_get',
    'webflow_form_submission_update',
    'webflow_form_submission_delete',
    'webflow_webhook_list',
    'webflow_webhook_get',
    'webflow_webhook_create',
    'webflow_webhook_update',
    'webflow_webhook_delete',
    'webflow_comment_thread_list',
    'webflow_comment_thread_get',
    'webflow_comment_reply_list',
    'webflow_comment_reply_create',
    'webflow_comment_thread_resolve',
    'webflow_ecommerce_settings_get',
    'webflow_product_list',
    'webflow_product_get',
    'webflow_product_create',
    'webflow_product_update',
    'webflow_sku_create',
    'webflow_sku_update',
    'webflow_order_list',
    'webflow_order_get',
    'webflow_order_update',
    'webflow_order_fulfill',
    'webflow_order_unfulfill',
    'webflow_order_refund',
    'webflow_inventory_get',
    'webflow_inventory_update',
    'webflow_redirect_list',
    'webflow_redirect_create',
    'webflow_redirect_update',
    'webflow_redirect_delete',
    'webflow_robots_get',
    'webflow_robots_replace',
    'webflow_robots_update',
    'webflow_robots_delete',
    'webflow_wellknown_create',
    'webflow_wellknown_delete',
    'webflow_activity_log_list',
  ].map((name) => [name, { since: '2026-09-05', batch: 'WEBFLOW-2' }]),
]);
