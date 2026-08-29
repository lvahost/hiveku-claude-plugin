# Record editing and deletion - field-level semantics

Load this before editing or deleting a vendor, payroll member, bill, bill attachment, expense
category or time entry. Every claim below is from the tools' registered descriptions. Two house rules recur:
unknown keys are silently stripped by the Zod parse (200 with nothing changed - re-read the row
to verify a field moved), and no delete takes a confirm field (the route writes on the first
call, so the confirmation is yours to run).

## Vendors

- **`target_currency` is a no-op on both vendor writes.** `accounting_vendor_create`
  advertises it and the registry description calls it "the payout currency for the Wise
  export", but the route parses with `vendorBaseSchema`, which has no such key, so zod strips
  it and the create never writes it - `accounting_vendors` has no `target_currency` column at
  all. Payout currency is a PAYROLL MEMBER field (`accounting_member_create.target_currency`);
  the Wise CSV is built from payroll run items, not vendors. Sending it looks accepted and
  stores nothing - and `accounting_vendor_update` drops it identically.
- `accounting_vendor_update({ vendor_id, ... })` - patches name, email, phone, website, the
  address fields, `tax_id`, `is_1099`, `default_expense_category_id`, `default_payment_terms`,
  `notes`, `is_archived`; everything else is stripped in silence (`target_currency` is exactly
  that case - no vendor column exists and both create and update drop it). An empty object is
  a legal no-op 200; sending no body at all 500s inside the JSON parse, so always send an
  object. `default_expense_category_id` must be this account's or the whole call 400s
  `Unknown default expense category`; null clears it; an ARCHIVED category is still accepted.
  Know what the fields do NOT do: `default_expense_category_id` is read only by the dashboard
  bill form - `accounting_bill_create` never inherits it - and `default_payment_terms`,
  `tax_id` and `is_1099` are stored labels with no bill-creation or year-end 1099 consumer.
  Bills already recorded keep their own terms, category and totals.
- Archive vs delete: `is_archived: true` hides the vendor from `accounting_vendor_list` (which
  filters `is_archived: false`) and blocks nothing else - `accounting_bill_create` still
  accepts an archived vendor because it checks `deleted_at` only. `is_archived: false` is the
  only way back and works solely while you hold the id (`accounting_vendor_get` still resolves
  an archived vendor; list never will again).
- `accounting_vendor_get({ vendor_id })` - the row plus a `stats` rollup: `open_balance_cents`
  and `open_bill_count` cover bills in submitted/approved/open/partially_paid ONLY, so a
  vendor whose bills are all drafts reads as 0 owed - sweep drafts separately.
  `lifetime_paid_cents` has no date window and counts payments against since-deleted bills:
  a lifetime figure, never a period one. The only read that resolves an archived vendor.
- `accounting_vendor_delete({ vendor_id })` - soft-delete: stamps `deleted_at`, forces
  `is_archived: true`, returns only `{ ok: true }`. Unconditional - a vendor carrying open
  unpaid bills is retired without a word, which is why the rollup read and a human yes come
  first. Nothing cascades (it is an UPDATE, not a row delete): every bill, payment and
  schedule keeps its `vendor_id`, bill reads still hydrate the vendor's name, and AP aging
  does not move. Two live consequences: `accounting_bill_create` rejects the vendor with 400
  `Unknown vendor`, while **any active recurring schedule pointed at it KEEPS generating
  bills** - the compiler copies `vendor_id` forward without checking `deleted_at`. One-way
  through Olympus: afterwards the id 404s on `_get` and `_update` and no tool can undelete it.

## Payroll members

- `accounting_member_update({ member_id, ... })` - reads name, email, `status`
  (`active | inactive` - **inactive is what removes them from future runs**), `pay_rate_type`
  (`hourly | fixed`), `pay_rate` and `bill_rate` (**DOLLARS**, x100 at the route edge),
  `pay_period` (`weekly | bi_weekly | semi_monthly | monthly`), the Wise payout fields
  (`source_currency` / `target_currency` - exactly 3 chars or 400 - `payment_type`,
  `payment_reference`), the display-only limits (`weekly_limit_minutes`,
  `daily_limit_minutes`, `time_tracking_enabled`, `project_count`, `bill_rate` - nothing
  enforces any of them; entries still log past a limit), `notes`, `is_archived`. Everything
  else is dropped - `pay_rate_cents` / `bill_rate_cents` return 200 with nothing changed, and
  `user_id` is the worst case: it survives the parse but is never written, so linking a member
  to a Hiveku user here always 200s and does nothing. Bad enums 400 the whole call.
- **An archived member is STILL PAID**: run creation selects on `deleted_at: null` plus
  `status: 'active'` and never reads `is_archived`. Archive hides the roster row; only the
  status flip stops payroll.
- `accounting_member_get({ member_id })` - the whole row in CENTS (`pay_rate_cents`,
  `bill_rate_cents`) plus the Wise fields; the only read that can see an ARCHIVED member. A
  404 means unknown id, wrong account, or already deleted - never merely archived.
- `accounting_member_delete({ member_id })` - soft-delete: stamps `deleted_at`, sets
  `is_archived: true` and `status: 'inactive'`. Unconditional; nothing cascades - time
  entries, payroll items, PTO balances and requests all survive, and the entries keep
  appearing in `accounting_time_entries_list` with the member's name. Afterwards
  `accounting_time_entry_create` refuses the member (400 `Unknown member`) and future runs
  skip them. Irreversible through Olympus. Prefer `status: 'inactive'` (stops pay, keeps the
  timesheet writable, reversible); prefer `is_archived: true` only to tidy the roster.

## Bills

- `accounting_bill_create({ vendor_id, line_items, ... })` - `vendor_id` and `line_items` are
  required. Each line item is `{ description, quantity, unit_cents, discount_cents?, tax_bps?,
  category_id?, sort_order? }`. `bill_number` is auto-generated from `bill_prefix`. Optional
  but worth filling: `bill_date`, `due_date`, `vendor_invoice_number`, `po_number`, `terms`,
  `currency`. Both ids are ownership-checked: a `vendor_id` from another account returns 400
  `Unknown vendor`, and a foreign `category_id` (bill level or line level) is rejected too.
- Status verbs: `accounting_bill_submit` (draft -> submitted); `accounting_bill_approve`
  (-> open; `approve: false` rejects back to draft; the route accepts **both** `draft` and
  `submitted`, so a draft can be approved without ever being submitted - do that only on the
  owner's word; any other status returns 409 `Cannot approve a bill in status "<x>"`);
  `accounting_bill_void({ bill_id, reason })` - only while `amount_paid_cents` is 0;
  `accounting_payment_reverse` can walk a paid bill back to that state one payment at a time
  (each reversal writes an offsetting negative row, restores balance and status in the same
  transaction, requires a `reason`, and works exactly once per payment - a second attempt is
  a 409).
- `accounting_bill_update({ bill_id, ... })` - editable ONLY while status is
  draft/submitted/approved/open AND `amount_paid_cents` is 0; anything else 409s telling you
  to duplicate the bill. **`line_items` REPLACES the whole set in one transaction**: every
  existing line is deleted and only the array you send is recreated - a one-line payload
  silently destroys the rest, each surviving line gets a NEW row id (a line-level id you pass
  is dropped), an empty array is a 400, and `sort_order` defaults to 0 on any line that omits
  it, collapsing the ordering the reads sort by. Read-modify-write: `accounting_bill_get`
  first, edit the full array, resend every line with `sort_order`. Totals recompute ONLY when
  `line_items`, `tax_bps` or `discount_cents` is present - a notes-only edit leaves stored
  totals alone. `discount_cents` is clamped to the subtotal. Document `tax_bps` applies only
  to lines whose own `tax_bps` is null. Pass null to clear `vendor_invoice_number`,
  `po_number`, `notes`, `terms`, `category_id`, `bill_date` or `due_date`; omit to leave
  alone. **Dates are parsed leniently: an unparseable `bill_date` / `due_date` is stored as
  NULL rather than rejected** - a malformed date silently clears the field. `status`,
  `currency`, `bill_number` and `owner_id` cannot be changed here (sent keys are dropped,
  200, nothing changed); status moves only through submit/approve/void. Payments are not in
  this response - `accounting_bill_get` for those.
- `accounting_bill_delete({ bill_id })` - SOFT-delete, refused 409 once `amount_paid_cents` is
  above 0 (a paid bill's fix path is now `accounting_payment_reverse` per payment until the
  paid total is zero, then void - delete still never touches a paid bill). NO status
  guard otherwise: draft, approved and already-voided delete the same way. Effectively
  irreversible: no route sets `deleted_at` back. Afterwards the bill leaves list/get and stops
  counting toward AP aging (a draft never counted). The consumed `bill_number` is never
  reused. P&L unaffected (cash basis; a deletable bill has no payments).

## Bill attachments (receipts / source documents)

- `attachment_count` rides every `accounting_bill_list` and `accounting_bill_get` row, so the
  no-source-doc-no-approval gate reads for free; `accounting_bill_attachment_list` is only
  needed to see the documents themselves. It returns them newest first: id, `bill_id`,
  `file_name`, `file_type`, `file_size` (bytes), `cdn_url` (the download link),
  `uploaded_by_user_id` (null for agent uploads) and `created_at`. An unknown or deleted
  bill id is a 404.
- `accounting_bill_attachment_create({ bill_id, file_name, content })` - `content` is base64
  (a data-URI prefix is stripped), max 15MB. PDF and image receipts ONLY: application/pdf,
  image/jpeg, image/png, image/webp, image/heic; `file_type` is inferred from the file_name
  extension when omitted, and anything else is a 400. Works on any non-deleted bill
  REGARDLESS of status - a paid bill can still receive its receipt after the fact. The file
  lands in S3 under `accounting/bills/<bill_id>/` with a timestamp+uuid uniquifier, so
  uploading the same file twice stores TWO attachments rather than overwriting (only literal
  retries of the same call are deduped by the idempotency layer) - list first when unsure
  what is already there. `uploaded_by_user_id` is null in the service-key context. Returns
  the created row with its `cdn_url`.
- `accounting_bill_attachment_delete` - removes ONE attachment, by explicit attachment id
  from the list; there is no bulk or pattern form. The DB row is deleted first, then the S3
  object best-effort, so the worst failure mode is an orphaned file in storage, never a
  dangling row in the books. Destructive and IRREVERSIBLE - no undelete route exists - and
  the tool's own contract says confirm with the human first, especially where the close
  discipline treats the receipt as the approval evidence. An id that does not belong to this
  bill and account is a 404.

## Expense categories

- `accounting_expense_category_create({ name, code?, sort_order? })` - only those three keys
  are read; the row is always created active. Omitted `sort_order` writes 0 and the list
  orders `sort_order` asc then name asc, so an unset row sorts in among the auto-seeded
  presets. `name` is UNIQUE per account INCLUDING archived rows: reusing an archived name is
  409 `A category with that name already exists` - the way through is
  `accounting_expense_category_update({ category_id, is_archived: false })` on the archived
  id, which is also the ONLY restore path (list filters archived out, so keep the id).
- `accounting_expense_category_update` - name/code/sort_order/is_archived only; `code: null`
  clears the GL code; an id-only call is an empty update (200, row echoed, nothing changed).
  Renaming onto any existing name, archived included, is a 409.
- `accounting_expense_category_archive` - soft (flips `is_archived`), unconditional, returns
  `{ ok: true }` and never the row - capture the id BEFORE calling. It does not check whether
  bills code to the category, and an ACTIVE schedule pointed at it keeps generating bills
  coded to it.

## Time entries

- **Why `accounting_time_entry_create` cannot be called.** It is in the registry but is not
  callable. It declares `properties: {}`, and the proxy's no-allowlist branch builds its
  allowlist from `Object.keys(inputSchema.properties)` - an EMPTY set, not an absent one - so
  it drops `member_id`, `work_date`, `minutes`, `hours`, `project`, `billable` and `note`
  alike and POSTs `{}`. The route requires `member_id` and `work_date`, so every call comes
  back 400 `Invalid payload`. Missing time is a dashboard entry: name the member, the date and
  the hours, have the owner add them on the accounting timesheet, then re-run
  `accounting_time_entries_list` and confirm the minutes landed before you generate a run.
- `accounting_time_entry_update({ entry_id, ... })` - reads `work_date`, `minutes`, `hours`,
  `project`, `billable`, `note`. `minutes` wins when both are sent; `hours` rounds to whole
  minutes; `minutes` must be an integer 0-1440 (else the whole call 400s), and unlike create
  this route accepts `minutes: 0`. An unparseable `work_date` collapses to undefined and
  returns 200 with the OLD date in place - send `YYYY-MM-DD`. **`member_id` is NOT patchable**:
  wrong-person entries are delete + re-log, and since `accounting_time_entry_create` drops
  every argument (see Play 4), the re-log is a dashboard entry.
- `accounting_time_entry_delete({ entry_id })` - HARD row delete, unconditional, no
  `deleted_at` column: the hours are gone and the only recovery is re-logging by hand.
- **Runs never recompute**: a payroll run snapshots minutes and `amount_cents` at create time,
  so editing or deleting entries after a run exists changes nothing it pays, and a second
  `run_create` for the period ADDS a run rather than correcting the first. Fix time first,
  then generate, once.

## Payroll runs

- `accounting_payroll_run_get({ payroll_run_id })` - one run plus every per-member item (name,
  minutes, `pay_rate_cents`, `amount_cents`, the Wise fields), the only Olympus surface
  carrying per-member amounts for a run you did not just create (`run_list` returns headers
  with an item COUNT only). READ-ONLY, and there is no Olympus mutation path at all:
  finalizing a run, marking it paid, deleting it and editing an item exist only on the
  dashboard route. Runs are born `status: draft` and nothing on the Olympus surface can move
  them out of draft.
- The Wise batch CSV at `/api/accounting/payroll/<run_id>/export` is **not reachable with a
  Hiveku API key** - it is session-authenticated in the dashboard, and it refuses a draft run
  with 409 `Finalize this payroll run before exporting the Wise CSV.` The hand-off is always:
  tell the owner exactly which run id to finalize and export in the Hiveku dashboard.
