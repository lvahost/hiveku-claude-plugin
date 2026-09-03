/**
 * Department aliases: one focus word that stands for several first-token
 * departments, a name prefix, or a bare tool name.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 * Both `hiveku_find_tools` (lib/tool-index.mjs) and directory focus
 * (lib/tool-focus.mjs) key on the FIRST underscore token of a tool name:
 * `ppc_*` is ppc, `crm_*` is crm. That works for every Hiveku department
 * except SEO, whose surface is split across a dozen vendor prefixes: the
 * DataForSEO tools are `backlinks_*`, `dataforseo_labs_*`, `serp_*`,
 * `on_page_*`, `keywords_data_*`, `content_analysis_*`, `domain_analytics_*`,
 * `business_data_*`, `ai_optimization_*` and the bare `crawl`. Measured
 * 2026-08-30: a search with `department: 'seo'` or a directory focus of `seo`
 * could not return ANY of the ~75 vendor tools, so a session concluded the
 * account had no backlink data when it had twenty backlink tools.
 *
 * ★ `content_analysis_` is an explicit PREFIX, not the `content` department.
 * Hiveku's own `content_*` tools (38 of them: `content_create`, `content_list`,
 * the editorial calendar) belong to the content agency, and dragging them into
 * an SEO focus would put a publish tool in a menu that asked for research.
 *
 * ★ Aliases only WIDEN. A department with no alias here matches exactly as
 * before (first token equals the department), so `ppc`, `crm`, `voice` and
 * every other focus behave identically to 0.14.x.
 *
 * `localseo` and `aeo` mirror the department ids in lib/dept-manifest.json so
 * a focus written from the manifest's vocabulary finds the tools that
 * department actually calls.
 *
 * The CREATIVE surface (2026-09-01) is split the same way SEO's was, just
 * across Hiveku's own prefixes instead of a vendor's: designs are `design_*`,
 * the library is `media_*`, brand is `brand_*`, generation is `generate_*`,
 * stock/gallery/avatar/before-after each hold their own first token, and the
 * storyboard + video-pipeline lane hides under `marketing_*`. Measured
 * 2026-09-01 against lib/tool-index.json: `department: 'creative'` matched
 * ZERO tools, and `design` matched only 21 of the ~140 the creative
 * department actually calls — so a creative focus advertised a menu with no
 * storyboard, no media library and no brand guide on it.
 *
 * ★ `marketing_storyboard_` / `marketing_video_pipeline_` / `marketing_design_`
 * / `marketing_media_` / `marketing_testimonial` are explicit PREFIXES, not the
 * `marketing` department: dragging all 69 marketing_* tools (reports, offline
 * conversions, SEO content) into a creative focus would bury the menu the
 * alias exists to surface.
 *
 * Re-measured 2026-09-03 against the regenerated lib/tool-index.json (1,901
 * tools): `creative` reaches 150, `design` 38, `media` 41. The four media
 * hands that shipped that day (media_import_url, media_transform,
 * media_upscale, media_image_quota) ride the `media` first token, so both the
 * creative and media aliases pick them up with no table change; `design`
 * deliberately does not (its menu is the canvas plus the video lanes, and the
 * library is the media focus's job).
 *
 * Like the focus filter and the search, this is a MENU concern only. Nothing
 * here gates `tools/call`; the real boundary is a scoped key.
 */

/** dept -> { depts: first-token departments, prefixes: name prefixes, names: bare names } */
export const DEPT_ALIASES = Object.freeze({
  seo: Object.freeze({
    depts: Object.freeze(['seo', 'backlinks', 'dataforseo', 'serp', 'on', 'keywords', 'domain', 'business', 'ai', 'entity', 'web']),
    prefixes: Object.freeze(['content_analysis_']),
    names: Object.freeze(['crawl']),
  }),
  localseo: Object.freeze({
    depts: Object.freeze(['seo', 'business', 'serp']),
    prefixes: Object.freeze([]),
    names: Object.freeze([]),
  }),
  aeo: Object.freeze({
    depts: Object.freeze(['seo', 'ai', 'entity', 'serp']),
    prefixes: Object.freeze([]),
    names: Object.freeze([]),
  }),
  creative: Object.freeze({
    depts: Object.freeze(['creative', 'media', 'brand', 'design', 'generate', 'stock', 'gallery', 'avatar', 'customer', 'before']),
    prefixes: Object.freeze(['marketing_storyboard_', 'marketing_video_pipeline_', 'marketing_design_', 'marketing_media_', 'marketing_testimonial']),
    names: Object.freeze(['marketing_generate_video']),
  }),
  design: Object.freeze({
    depts: Object.freeze(['design']),
    prefixes: Object.freeze(['marketing_design_', 'marketing_storyboard_', 'marketing_video_pipeline_']),
    names: Object.freeze(['marketing_generate_video']),
  }),
  media: Object.freeze({
    depts: Object.freeze(['media', 'stock', 'gallery']),
    prefixes: Object.freeze(['marketing_media_']),
    names: Object.freeze(['generate_image', 'generate_image_set']),
  }),
});

/** First underscore token, lower-cased; null for a bare name or junk. Mirrors tool-focus departmentOf. */
function firstToken(toolName) {
  const i = toolName.indexOf('_');
  return i === -1 ? null : toolName.slice(0, i).toLowerCase();
}

/**
 * Does `toolName` belong to `dept`, once aliases are applied?
 *
 * Without an alias this is exactly the old rule (first token equals dept).
 * With one, the tool matches if its first token is in the alias's dept list,
 * its name starts with one of the alias's prefixes, or it IS one of the
 * alias's bare names.
 */
export function deptMatches(toolName, dept) {
  if (typeof toolName !== 'string' || !toolName) return false;
  const wanted = String(dept ?? '').trim().toLowerCase();
  if (!wanted) return false;
  const own = firstToken(toolName);
  // Object.hasOwn, not a bare lookup: parseFocus lets `constructor` through,
  // and DEPT_ALIASES['constructor'] is a function, not an alias.
  if (!Object.hasOwn(DEPT_ALIASES, wanted)) return own === wanted;
  const alias = DEPT_ALIASES[wanted];
  if (own !== null && alias.depts.includes(own)) return true;
  if (alias.prefixes.some((p) => toolName.startsWith(p))) return true;
  return alias.names.includes(toolName);
}

/** The departments a focus word expands to, for banners and docs. Unaliased words return themselves. */
export function expandDept(dept) {
  const wanted = String(dept ?? '').trim().toLowerCase();
  if (!wanted) return [];
  return Object.hasOwn(DEPT_ALIASES, wanted) ? [...DEPT_ALIASES[wanted].depts] : [wanted];
}
