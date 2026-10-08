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
3. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })` and note its `version` and when you read it, append your note to the `content` it returns, then check `memory_log_list({ memory_id, since: "<when you read it>" })` and merge any newer change into your text (a department agent or a person may have edited it since), and send the WHOLE merged document to `memory_update({ memory_id, content, reason, expected_version })`, which REPLACES it (sending only the new note destroys everything that department had accumulated; `reason` is one plain line on why, and `expected_version` is the version you merged into, so a 409 `version_conflict` means it changed again: merge into the `content` that answer carries and save with its `version`, never resend blind); use `memory_create({ type: "memory", name: "<dept>", content, reason })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id, reason })` restores one (it works for deleted entries too). Hiveku records the session's Doing in the memory log at its first change, and its Done, counting the changes, when the session goes quiet. When `memory_log_add` is listed, end with a Done line that says what you did, if you want the log to say more than that: `memory_log_add({ phase: "done", department: "<dept>", line, outcome })`, `outcome` ok, failed or stopped, which closes the session's run with your line; leave `thread` out, and a Doing line sent once the session's is recorded answers `already_open`, which is not an error. Each `line` is one plain sentence of at most 160 characters in your own words, never a customer's words, a secret or personal details. Hiveku, not this folder, is the source of truth.
