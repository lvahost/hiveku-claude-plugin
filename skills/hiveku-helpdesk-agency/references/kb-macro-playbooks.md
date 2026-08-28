# KB and macro playbooks - deflection program design (Plays 3-4 depth)

Load this when building or auditing the knowledge base and macro library. Argument-level
mechanics (fields, defaults, tri-states, render behavior) live in references/tool-mechanics.md;
this file is the program design.

## Play 3 depth - Knowledge base and deflection

The KB is the highest-leverage asset in support: it answers tickets before they are opened and
gives macros something to link to.

- Find gaps from real demand: the top contact reasons from the Play 1 baseline that have no
  article are your writing queue. Check current coverage with `helpdesk_kb_categories_list` and
  `helpdesk_kb_search` before writing anything, so you extend rather than duplicate. On a fresh
  account with no categories, structure comes first: article creation requires a `category_id`,
  so create the 3-5 categories the contact-reason map implies with
  `helpdesk_kb_categories_create({ name, parent_id? })` (slug auto-derives; `parent_id` makes a
  sub-category) before drafting the first article.
- Let the system point at gaps too: `helpdesk_kb_suggest_articles({ q })` surfaces articles the
  system believes are relevant (use it against a ticket to see whether an answer already exists,
  and where it returns nothing for a common question, that is a gap). It returns PUBLIC articles
  only, which is exactly why it is the tool to use when picking links for an outbound reply - you
  cannot accidentally link an internal doc to a customer. `helpdesk_kb_search({ q, visibility })`
  takes `public | internal | all` and defaults to `all`, so search results you paste into a
  customer reply must be visibility-checked by hand.
- Draft articles yourself against `agent_identity_get({ domain: 'helpdesk' })` - the question, the
  correct answer, and the audience - then create with
  `helpdesk_kb_article_create({ title, body, excerpt, category_id, tags, visibility })`. It
  defaults to `visibility: 'draft'` with `publish: false`, which is HIDDEN from search: creating an
  article does not publish it, so never report a create as "published". Create as a draft, get the
  client's sign-off, then `helpdesk_kb_article_update({ id, visibility: 'public' })` - and know
  that setting `public` AUTO-PUBLISHES to customers immediately, so that flip is the live moment,
  not a staging step. `internal` is agents-only. Always write an `excerpt`; it is what customers
  see in search results. Confirm title, category, body, and visibility before the call.
- To pull an article back down: `helpdesk_kb_article_update({ id, published_at: null })`
  unpublishes. `published_at` is tri-state - `null` to unpublish, `true` to publish now, or an ISO
  datetime to backdate. Update existing articles with `helpdesk_kb_article_update` when a product
  change makes them wrong - a stale KB article is worse than none because it fails customers
  confidently, and if you cannot fix it in the moment, unpublish it.
- Retire vs delete: the mirror of the macro rule. Unpublish (`published_at: null`) is the safe
  stop - the article survives, invisible to customers, recoverable by republishing.
  `helpdesk_kb_article_delete` exists and is permanent; it is for junk and true duplicates the
  client has named by id, never for "old" articles selected by age or pattern, and never as a
  substitute for fixing or unpublishing.
- Read before you edit: `helpdesk_kb_read_article` to load the current body so an update is a
  surgical edit, not a blind overwrite.
- Close the loop with replies: when a reply answers a question the KB should own, write the
  article and then have macros link to it (Play 4). Track deflection candidates and articles
  shipped as `pm_tasks_create` items so the monthly report can show KB growth.

## Play 4 depth - Macros (canned responses that scale the team)

Macros turn a repeated answer into a two-second reply and keep tone consistent across agents.

- Inventory and audit: `helpdesk_macros_list`, then `helpdesk_macros_get({ id })` - the argument
  is `id`, not `macro_id` - to read the raw body with all its `{{placeholders}}` showing. That raw
  body is how you learn which variables `helpdesk_macros_render` needs. Macros drift out of date
  silently.
- Build from the reply data: the drafts you write more than twice in Play 2 are macro candidates.
  Write the body against the persona and brand guide from `agent_identity_get({ domain:
  'helpdesk' })` so it lands in brand voice, then create it with
  `helpdesk_macros_create({ title, body, description, tags })` - the field is `title`, not `name`,
  and `title` + `body` are the required pair. Confirm title, body, and placeholders first. Use the
  supported template vars so `helpdesk_macros_render` can personalize per ticket:
  `{{contact_first_name}}`, `{{ticket_short_id}}`, `{{account_name}}`, `{{agent_name}}`,
  `{{portal_url}}`. Tag them or the picker stops being navigable.
- Maintain them: `helpdesk_macros_update({ id, ... })` when a policy or product changes;
  allow-listed fields are title, body, description, tags, is_active. A wrong macro multiplies a
  mistake across every ticket it touches, so treat a macro edit with the same care as a KB edit.
  Retire rather than delete where you can - `is_active: false` makes `helpdesk_macros_render`
  refuse with 400, which is a safe stop, while `helpdesk_macros_delete` is gone for good.
- Test before trusting: `helpdesk_macros_render({ id, variables })` with a realistic variables map
  to confirm every placeholder resolves before an agent relies on it live. Remember every render
  bumps `usage_count`, so test renders nudge the account's most-used ordering - test once, not in
  a loop.
- Coverage goal: a macro (or KB article, or both) for each of the top contact reasons. That set
  is what lets the team hold SLA when volume spikes.

## Hygiene cadence

Weekly, as part of the standing cadence: any macro or article made wrong by a product change
this week gets updated (`helpdesk_macros_update` / `helpdesk_kb_article_update`) before it
misinforms at scale. Monthly, report the deflection story with what the tools can actually
measure: macro `usage_count` (most-used sort on `helpdesk_macros_list`) and ticket volume on
the deflected contact reason before vs after - KB view counts are not exposed by any tool here,
so they come from the dashboard or stay out of the report.
