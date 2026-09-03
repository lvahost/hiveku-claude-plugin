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
]);
