# PTO administration - policies, balances, requests, approvals

Load this before ANY PTO write: `accounting_pto_policy_create` / `_update` / `_deactivate`,
`accounting_pto_balance_set`, `accounting_pto_request_create`, `accounting_pto_request_review`.
Every claim below is from the tools' registered descriptions.

## Units: hours in, minutes stored

Every PTO write takes HOURS and stores `Math.round(hours * 60)` minutes. A fraction under a
minute vanishes. Reads report minutes. Echo both forms before any write: "40 hours =
2400 minutes". `accrual_hours_per_year: 0` on a policy means unlimited or manually granted,
NOT zero entitlement.

## Policies

- `accounting_pto_policy_create({ name, paid?, accrual_hours_per_year? })` - only those three
  keys persist. **`is_active` is accepted by the parse and then never passed to the create**,
  so a policy created with `is_active: false` comes back ACTIVE anyway; switch it off
  afterwards with `accounting_pto_policy_deactivate`. `paid` is metadata the PTO reads echo
  back - payroll runs never read PTO at all, so flagging a policy paid adds nothing to any pay
  run. Idempotency-wrapped: a timed-out retry replays for an hour instead of duplicating.
- `accounting_pto_policy_update({ policy_id, ... })` - patches in place; omitted fields are
  left alone. The input unit is `accrual_hours_per_year` in HOURS - sending the stored column
  name `accrual_minutes_per_year` is dropped and returns 200 with nothing changed.
  `is_active: true` is the ONLY way back for a deactivated policy, and it is always reachable
  because `accounting_pto_policies_list` returns inactive policies too, sorted active first.
- `accounting_pto_policy_deactivate({ policy_id })` - despite the DELETE verb NOTHING is
  deleted: it sets `is_active: false` and every balance grant and request under it survives.
  Fully reversible. Two traps: filing a request checks policy OWNERSHIP but not `is_active`,
  so a deactivated policy still accepts brand-new requests and their minutes still count once
  approved; and `accounting_pto_balances_list` resolves names for ACTIVE policies only, so
  every balance row under a deactivated policy silently starts reporting policy_name
  "Policy".

## Balances (`accounting_pto_balance_set`)

An **absolute SET, not an accrual top-up**: the previous grant is overwritten and no history
row is kept, so a second call with a smaller number silently erases the first.
**Read-before-set, always**: `accounting_pto_balances_list` first, state "granted moves from
X to Y hours", get the yes, then set. The returned row carries `granted_minutes` and no used
or remaining figure - the balances list recomputes those at read time by summing every
approved request, so a wrong USED figure can only be corrected by re-reviewing requests,
never here. Granting under a deactivated policy succeeds but shows as policy_name "Policy".
Not idempotency-wrapped; safe to retry only because the write is an absolute set.

## Requests

- `accounting_pto_request_create({ member_id, policy_id, start_date, end_date, hours, note? })`
  - status is hardcoded `pending`; a pre-approved request cannot be created here. Dates as
  plain `YYYY-MM-DD` (an unparseable string is 400 `Invalid dates`; a full ISO timestamp is
  accepted and its time discarded). **Nothing validates the remaining balance, overlapping
  dates, or whether the policy is still active** - this happily books time the member does not
  have, and approving it later drives `remaining_minutes` negative. Read
  `accounting_pto_balances_list` first. Idempotency-wrapped.
- `accounting_pto_request_review({ request_id, action })` - `action` is `approve | deny |
  cancel`; anything else is 400 and every other body key is dropped. **There is NO status
  guard**: an already-decided request can be flipped to any other state repeatedly, and
  nothing checks the balance first. `approved` is the only status that counts anywhere:
  `used_minutes` is a live SUM over approved requests with NO date window, so approving a
  request from any period moves the current remaining figure immediately, and flipping it back
  to denied restores it.

## The approval procedure (the tool has no guardrails, so you are the guardrail)

1. `accounting_pto_requests_list({ status: 'pending' })` - the queue.
2. `accounting_pto_balances_list` - the decision is against a real remaining balance. Refuse
   to approve past a zero or negative remaining without the owner explicitly accepting the
   negative balance.
3. A NAMED human approves or denies each request - never approve on your own judgment, and
   never batch-approve ("approve all the PTO" gets the queue listed per member with balances,
   not a loop of approvals).
4. **`reviewed_by_user_id` is forced to NULL on this service-key route - the system records no
   approver.** So YOU record it: log who approved what to department memory or the PM task,
   every time. Without that line there is no audit trail at all.
5. Nothing downstream reads the status: no email or notification is sent, so tell the member
   yourself (via the owner), and payroll runs never read PTO - approving PAID time off adds
   zero to any pay run. Paid leave for an hourly member is a deliberate dashboard timesheet
   entry (`accounting_time_entry_create` cannot carry a body - see Play 4).
