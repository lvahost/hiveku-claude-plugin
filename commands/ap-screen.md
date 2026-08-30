---
description: AP duplicate/fraud screen - same-vendor same-amount pairs, schedule shadows, first bills from never-paid vendors, out-of-pattern amounts. A report and PM tasks, never an auto-action.
---
AP screen. **All accounting money is integer CENTS**; echo both forms on every flagged row:
"$1,200.00 = amount_cents: 120000". This command is READ-ONLY by contract: it flags, it never
fixes. **Never approve, void, delete, pay, or reverse a bill or payment from this pass - and never
attach or delete a bill attachment from it either** - a false positive "cleaned
up" with `accounting_bill_delete` is gone for good (soft-delete with no un-delete route anywhere,
no status guard, refused only once `amount_paid_cents` is above 0), and a real duplicate still
needs a human to rule on which twin is the fake. Resolution runs through `/hiveku:books-close` and
`/hiveku:books-pay` after the owner decides.

1. **Pull everything once, then reconcile.** Loop
   `accounting_bill_list({ status: "all", limit: 200, offset: N })` until you have seen `total`
   rows (default limit is 50; a partial pull produces confident, wrong flags). Partition locally:
   `draft` / `submitted` / `open` / `partially_paid` are the live screen targets; `paid` history is
   the per-vendor baseline; `void` is out. Reconcile the live-status sum of `balance_due_cents`
   against `accounting_ap_aging.total_cents` (aging counts `open`, `partially_paid`, `submitted`,
   `approved`) - flag nothing until the pull is provably complete. Keep each row's
   `attachment_count` (every list/get row carries it now) - it feeds the weighting below.
2. **Flag A - duplicate-shaped pairs.** Group by vendor. Flag any two bills from the same vendor
   with the same `total_cents` and due dates within 14 days of each other - **including pairs where
   one side is already `paid`**; a duplicate that got paid once is exactly the catch that matters.
   An identical `bill_number` upgrades the pair to near-certain; a different `bill_number` clears
   nothing (a re-keyed bill gets a fresh number). Before raising, cross-check against step 3's
   schedules: identical amounts on a live weekly cadence are the schedule doing its job, not fraud.
   Where statements have been imported, `accounting_bank_transactions_list({ matched:
   "bill_payment" })` can show whether BOTH twins' payments actually cleared the bank - two cleared
   lines turns a duplicate-shaped pair into money out the door twice; put that in the evidence.
3. **Flag B - schedule shadows.** `accounting_bill_schedules_list`, then
   `accounting_bill_schedule_get` per schedule (by UUID) for the resolved vendor, cadence,
   `next_run_at` / `last_run_at`, and the line template amount. Schedule-generated bills are born
   `status: open` with `approval_status: not_required` - **they never pass submit or approve**, so
   a schedule is a standing authorization to pay and its vendor is a soft target. Flag a hand-keyed
   bill on a scheduled vendor at a cadence-adjacent amount (more than one bill at the template
   amount inside one cadence period = a shadow double-booking the payable). Do NOT flag manual
   bills on an exhausted schedule (`is_active: true` with `next_run_at: null` will never fire
   again - manual billing there is expected).
4. **Flag C - first bill from a never-paid vendor.** For each vendor carrying a live bill,
   `accounting_vendor_get` (by UUID) returns a `stats` rollup: `open_balance_cents`,
   `open_bill_count`, `lifetime_paid_cents`. `lifetime_paid_cents: 0` with this as the vendor's
   only bill is the classic fake-invoice shape - a vendor this account has never once paid, asking
   for money. Weight it up when the amount sits just under the approval cap the account keeps in
   department memory (`memory_list` - the cap is a client-side convention; nothing server-side
   enforces it, which is why this screen exists), and again when `attachment_count` is 0 - a first
   bill with no source document attached is the full fake-invoice silhouette.
   `accounting_bill_attachment_list` shows what evidence a flagged bill does carry (`file_name`,
   `file_size`, `cdn_url` to eyeball the document) - a read, which is all this pass makes. Note the rollup's own blind spot: drafts and
   voids are invisible to `open_bill_count`.
5. **Flag D - out-of-pattern amount.** Per vendor, take the median `total_cents` of `paid` +
   `partially_paid` history and flag any live bill above 2x that median. **Fewer than 3 historical
   bills is no pattern** - say "no baseline" instead of manufacturing one (step 4 already covers
   the no-history vendor).
6. **Flag E - who wrote it.** `audit_query({ tool_name: "accounting_bill_create" })`, grouped by
   `api_key_preview` - a key that never wrote AP before and suddenly creates bills is a flag.
   Honesty limit: the audit log records MCP tool calls ONLY, so a bill keyed in the dashboard
   leaves no row here - absence of an audit row is not absence of a creator, and this flag can
   only ever be corroborating, never clearing.
7. **Report, then PM tasks - one per flag, evidence inline.** Present every flag with the rule
   that fired, the bill ids, both money forms, the dates, and the vendor. Then
   `pm_tasks_create({ project_id, title })` per flag, the title carrying rule + vendor + amount and
   the evidence rows included so the human who rules on it never has to re-derive them. If nothing fired, say so and report the
   baseline counts (bills screened, vendors, windows) - a clean screen with named coverage is a
   deliverable; "looks fine" is not.
8. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
