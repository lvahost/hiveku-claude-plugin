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
