---
description: "\"Is our business info consistent across directories?\" / \"our phone number is wrong on Yelp\" / \"run a citation audit\" - the citation pass: the stored snapshot first, the paid audit only on a confirmed spend inside the 24-hour cooldown rule, the competitor listings footprint, then a per-directory fix list. No directory write exists anywhere in Hiveku: nothing is submitted, edited or claimed from here."
argument-hint: "[location or connection, optional]"
---
Citation and NAP consistency pass ($ARGUMENTS). Follow the **hiveku-seo-agency** skill; load
`references/local-seo.md` (Play L10, the three citation traps, the Listing Score honesty rules).
1. Context: `account_context_get({ domain: "seo" })` for the REAL business name (not the marketing
   name), the service area and who may speak publicly; `memory_list({ domain: "seo" })` for the
   canonical NAP exactly as published. `seo_connections_list` for the google_business_profile rows
   (one connection is one location; `needs_setup` means unbound, bind it via `/hiveku:local` first).
2. Stored first, free: `seo_citations_get({})` returns one row per active GBP connection. `audit: null`
   means never audited. Read `audited_at`, the canonical NAP, `directories_found`, `consistent`,
   `inconsistent` (with per-field `their_value` vs `expected`) and `missing_major`. A snapshot recent
   enough for the question ends the data-gathering here.
3. NAP truth: `seo_gbp_listing({ connection_id })` for the synced NAP block and verification and
   duplicate status; if the snapshot is over 26 hours old, one `seo_gbp_location({ connection_id })`
   (live, quota-limited, refreshes the cache; never looped; `gbp_quota_exceeded` means wait,
   `gbp_quota_not_approved` means the Cloud project never passed review).
4. A fresh audit only when the snapshot is stale or missing [CONFIRM the spend, per connection]:
   `seo_citations_audit({ connection_id })` [SPENDS - class I, ONE Business Listings search, metered
   under the account's research cap with no confirm step of its own, so you are the gate]. A 429 with
   `retry_at` is the 24-hour cooldown returning the stored audit: not a failure, report it as of
   `audited_at`. `missing_major` entries with `basis: "no_signal"` are UNVERIFIED, never "not listed".
5. Competitor footprint: `business_data_business_listings_search` for the category around the
   location [SPENDS - one Business Listings request; check the tool's schema for the category and
   coordinate arguments]: which directories the pack holders sit on, their review counts and ratings,
   which frames what this quarter can honestly promise.
6. Verify by hand what the audit could not: for each `no_signal` directory, `web_search` the business
   name with the directory name and `web_scrape` the hit; report what you saw, labeled as a manual
   check with its date.
7. The fix list, per directory, worst fields first (phone and address outrank a name variant), with
   `their_value` vs `expected` quoted verbatim, and per location (never averaged across locations).
   No submission or edit tool exists for any directory by design, and `seo_citations_audit` never
   writes: every fix is a client or dashboard action. `pm_tasks_create({ project_id, title,
   description })` per inconsistent or missing-verified listing, the NAP to publish in the body.
8. Tell the client: consistent, inconsistent and unverified counts as three separate numbers, the
   directories that matter for the category, what changes and where, and that the next audit runs no
   sooner than 24 hours after this one. Honesty rules: unverified is its own bucket; a 402 or 503 makes
   the audit partial, never "no listings"; a stored audit is reported with its date, never as today.
9. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
