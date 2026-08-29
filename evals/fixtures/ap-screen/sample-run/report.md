# AP screen - Brightside Fixtures - 2026-08-29

Read-only pass. No bill was approved, voided, deleted, or paid.

## Coverage and reconciliation

- 32 bills pulled in one paginated pass; the tool's own total confirms 32, so the pull is complete before anything is flagged.
- Live screen targets (open + submitted) sum to $9,750.00 = 975000 cents of balance due, which reconciles exactly to accounting_ap_aging total_cents 975000.
- Paid history is the per-vendor baseline; the one void bill is out entirely; the one draft is partitioned but carries no flag.

## Flag A - duplicate-shaped pair: Meridian Office Supply

- bill_mer_open_1 (MOS-2214, due 2026-08-20) and bill_mer_open_2 (MOS-2231, due 2026-08-27): both $1,840.00 = amount_cents: 184000, due seven days apart.
- Different bill numbers clear nothing - a re-keyed bill gets a fresh number.
- No schedule exists for this vendor, so no cadence explains twins.
- The amount itself is unremarkable: paid history runs 170000 / 175000 / 180000 / 185000 / 195000 cents and brackets it - which is exactly why this is a duplicate-shape flag and not an amount flag.
- The owner rules on which twin is real; resolution runs through /hiveku:books-close, not this pass.

## Flag D - out-of-pattern amount: Crestline Janitorial

- bill_cre_open_1 (CJ-467): $1,350.00 = amount_cents: 135000, against a paid-history median of $397.50 = 39750 cents (38000 / 39500 / 40000 / 42500) - several multiples over the doubled-median line the screen draws.
- The voided CJ-460 was excluded from that baseline; a void in the median would have masked the outlier.

## Screened and cleared, with the reason each survived

- Lakeview Grounds Care: two open bills at $950.00 = 95000 cents within seven days look like Flag A, but the live weekly schedule's template amount matches exactly and each sits in its own cadence period - the schedule doing its job.
- Hargrove IT Services: HIT-207 is hand-keyed on an exhausted schedule (is_active true, next_run_at null - it will never fire again), so manual billing there is expected, not a shadow.
- Bright Signal Media: $2,100.00 = 210000 cents is the account's largest live bill, but the vendor has only two paid bills (60000 / 65000 cents) - fewer than three is no baseline, so no pattern claim is made; and lifetime_paid_cents of 125000 means the never-paid-vendor rule does not apply either.
- Writer check: the audit log shows 18 bill-create rows, every one from the same long-standing key hk_live_****ops7 - no new writer. Dashboard-keyed bills leave no audit row, so this check corroborates and can never clear.

## PM tasks filed

- pmt_1 - Flag A ruling: Meridian duplicate pair, evidence inline so the owner never re-derives it.
- pmt_2 - Flag D review: Crestline out-of-pattern bill.

A clean screen would still have been a deliverable; this one was not clean. Department memory updated with the screen's outcome.
