---
description: "Find the questions customers keep asking that we have no written answer for - mine ticket themes + CSAT, then draft the missing knowledge-base articles."
---
KB gap sweep. 1. `helpdesk_csat_stats({ since })` (it also returns a per-assignee breakdown - an
outlier agent is a coaching problem, not a KB gap) + recent `helpdesk_ticket_list({ status })`,
paged with `page`/`limit` → recurring themes with no KB coverage. Test each theme with
`helpdesk_kb_search({ q, visibility: "all" })` for what exists at all, and
`helpdesk_kb_suggest_articles({ q })` for what a customer would actually be shown - a theme that
`suggest` returns nothing for is a real gap even when an internal doc exists.
2. Write the missing articles yourself (`helpdesk_kb_suggest_articles` only surfaces EXISTING
   public articles; it does not draft anything) →
   `helpdesk_kb_article_create({ title, body, excerpt, category_id, tags })`, which already
   defaults to `visibility: "draft"` and `publish: false` - that is what you want, and it means a
   create is NOT a publish, so never report one as live. Always include an `excerpt`; it is the
   customer-facing search snippet. After sign-off, publish with
   `helpdesk_kb_article_update({ id, visibility: "public" })`, which goes live to customers
   immediately (`published_at: null` on the same tool pulls it back down). These are the PUBLIC
   support articles. The bare
   `kb_*` family is a different substrate - the account's AI knowledge bases, chunked and embedded for
   agent retrieval. If the recurring theme is one the agents keep getting wrong (not one customers keep
   asking), the fix belongs there instead: `kb_documents_index_text({ kb_id, title, content })`, verified
   with `kb_search({ query, kb_id })`.
3. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. Hiveku, not this folder, is the source of truth.
