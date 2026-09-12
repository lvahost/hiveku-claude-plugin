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
 *                Both batches landed in the live index on 2026-09-06 (registry
 *                ba4b74b7d8bb); entries deleted.
 *     WEBFLOW-3  the nine beta SEO actions (2026-09-06): page schema markup
 *                (get, set, query, bulk update), the bulk page metadata write,
 *                the page query, and llms.txt (get, set, delete). Generated
 *                into the MCP server working tree from the builder's
 *                page-seo.ts and llms-txt.ts; spelled in prose only in
 *                hiveku-web-agency/references/webflow-sites.md's Availability
 *                table. Landed in the live index on 2026-09-06 (MCP 4f0f0b7);
 *                entries deleted.
 *
 *   Images program (2026-09-12: GPT Image 2.5 as the default image model, the
 *   brand image profile, and article imagery as a pipeline step). The contract
 *   is the builder's commits 3efdcb0f7 (the direct OpenAI Images client),
 *   a1068fa5d (registry default gpt-image-2.5 = gpt-image-2.5-flare, with
 *   gpt-image-2.5-sunburst and the gemini-3.1 fallback), e61447d21 (real
 *   per-image pricing), 04bd774d8 (the brand image profile, the brand_reference
 *   tag and GET /api/olympus/marketing/brand/image-profile), d67189972 and
 *   4caf81b81 (the article images pipeline and GET/POST
 *   /api/olympus/marketing/content/:contentId/images). The MCP declarations
 *   are the IMAGES-1 lane's commit in hiveku-mcp-api-server; the live index
 *   regenerates after that deploy, and tool-names.test.mjs then forces these
 *   entries out.
 *     IMAGES-1  content_images_generate (the hero and one image per H2 for one
 *               content item, alt text on each, metered per image against the
 *               monthly image allowance) and brand_image_profile_get (the
 *               prompt block, avoid list and reference images every branded
 *               generation now sends). Spelled in prose by the content skill
 *               (Play 3 and references/media-and-visuals.md), the creative
 *               skill (rung 2 and references/brand-and-assets.md) and
 *               commands/media.md.
 *
 *   Elite content program, round A (2026-09-12: the knowledge base as the
 *   research layer, proof packs and case studies from won deals, distribution
 *   as part of the asset, and a scorecard that counts leads per piece). The
 *   contract is the builder's commits 23bed5d65 + bdc4f2f6b (the research run,
 *   POST|GET /api/olympus/marketing/content/:contentId/research, POST|GET
 *   /content/research, GET /api/olympus/knowledge-bases/artifacts[/:id]),
 *   4cd5bd7f6 + 95ec02834 (the proof pack route and the proof rules in the
 *   on-page check), a1bea92a4 + a8125a616 (the case-study draft from a won
 *   deal, idempotent, the account's won statuses), e47ab5f70 (the campaign ROI
 *   report, GET /api/olympus/marketing/reports/campaign-roi) and 5d58d7d8b
 *   (the scorecard and its nightly writer, which changed the two live reads
 *   content_analytics_get and content_page_views_get rather than adding a
 *   name). The MCP declarations are the parallel MCP lane's commit in
 *   hiveku-mcp-api-server; the live index regenerates after that deploy, and
 *   tool-names.test.mjs then forces these entries out.
 *     ELITE-A   content_research_run, content_research_get,
 *               content_research_topic, kb_artifacts_list, kb_artifact_get,
 *               content_proof_pack, content_case_study_draft, and
 *               marketing_campaign_roi. Spelled in prose by the content
 *               skill (Play 1 step 5, Play 3 steps 1 and 5, Play 4, Play 5),
 *               its two new references (research-and-proof.md and
 *               distribution-and-scorecard.md carry the Availability tables),
 *               commands/research.md, commands/campaign.md and
 *               commands/sme-interview.md. marketing_campaign_roi is not a
 *               gated prefix, so the honesty gate would not catch a rename of
 *               it; it rides here so the Availability table and this file are
 *               the two places that spell it, and content-doctrine.test.mjs
 *               checks the table against the index and this batch.
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

  // WEBFLOW-1 and WEBFLOW-2: landed in the live index on 2026-09-06 (MCP
  // registry ba4b74b7d8bb, 101 webflow_* tools); entries deleted.

  // WEBFLOW-3: landed in the live index on 2026-09-06 (MCP 4f0f0b7, 110
  // webflow_* tools, 2026 tools total); entries deleted.

  // WEBFLOW-4: the Olympus write path for website_projects.cms_provider (MCP
  // 91e81ab, 111 webflow_* tools). It is the last step of an agent-driven
  // Webflow handover - without it the connection binds and the project stays
  // on the native CMS until a human switches it in the dashboard. Gated
  // because flipping it points every subsequent content write at the
  // customer's live site.

  // CONTENT-1 (2026-09-12): content_seo_check, content_site_links and
  // department_turn_get landed in the live index on 2026-09-12 (MCP b0e0d4d +
  // a675885 deployed; index regenerated at 2030 tools); entries deleted.

  // IMAGES-1 (2026-09-12): content_images_generate and brand_image_profile_get
  // landed in the live index on 2026-09-12 (index regenerated at 2032 tools
  // during the email-marketing release); entries deleted. See the batch note
  // above for the billing shape.

  // ELITE-A (2026-09-12): content_research_run, content_research_get,
  // content_research_topic, kb_artifacts_list, kb_artifact_get,
  // content_proof_pack, content_case_study_draft and marketing_campaign_roi
  // landed in the live index on 2026-09-12 (MCP fb5082a + c1fa3f5 + 4e3eceb
  // deployed; index regenerated at 2040 tools); entries deleted. See the
  // batch note above for the contract.
]);
