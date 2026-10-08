# PTO administration - policies, balances, requests, approvals

Load this before ANY PTO write: `accounting_pto_policy_create` / `_update` / `_deactivate`,
`accounting_pto_balance_set`, `accounting_pto_request_create`, `accounting_pto_request_review`.
Every claim below is from the tools' registered descriptions or, where the server's rules have
moved on from a description, from the builder routes behind them - the route is what answers.

## Units: hours in, minutes stored

PTO grants, requests and accrual take HOURS and store `Math.round(hours * 60)` minutes. A
fraction under a minute vanishes. Reads report minutes. Echo both forms before any write: "40
hours = 2400 minutes". **The two policy limits are the exception**: `max_balance_minutes` and
`carryover_max_minutes` are sent in whole MINUTES (0 to 1,000,000; `null` for none), so a
40-hour cap is `2400`, not `40`. `accrual_hours_per_year: 0` on a policy means unlimited or
manually granted, NOT zero entitlement.

## Policies

- `accounting_pto_policy_create({ name, paid?, accrual_hours_per_year?, max_balance_minutes?,
  carryover_max_minutes? })` - only those five keys persist. **`is_active` is accepted by the
  parse and then never passed to the create**, so a policy created with `is_active: false`
  comes back ACTIVE anyway; switch it off afterwards with `accounting_pto_policy_deactivate`.
  `paid` is more than a label: approved leave under a `paid: true` policy is paid to an
  hourly member as hours in the payroll run that covers those days (a fixed member's pay is
  the same either way). `max_balance_minutes` caps accrual - it stops once carried-in +
  granted + accrued reach the cap, and hours granted by hand are never cut.
  `carryover_max_minutes` is how much unused time carries into the next year; left out or
  0, each year starts fresh. Idempotency-wrapped: a timed-out retry replays for an hour
  instead of duplicating.
- `accounting_pto_policy_update({ policy_id, ... })` - patches in place; omitted fields are
  left alone. The accrual input is `accrual_hours_per_year` in HOURS - sending the stored
  column name `accrual_minutes_per_year` is dropped and returns 200 with nothing changed. The
  two limits are sent in MINUTES under their own names; `null` removes one. A limit changed
  today re-reads every earlier year under the new setting, so a carry-over edit moves this
  year's balances at once - read `accounting_pto_balances_list` before and after.
  `is_active: true` is the ONLY way back for a deactivated policy, and it is always reachable
  because `accounting_pto_policies_list` returns inactive policies too, sorted active first.
- `accounting_pto_policy_deactivate({ policy_id })` - despite the DELETE verb NOTHING is
  deleted: it sets `is_active: false` and every balance grant and request under it survives.
  Fully reversible. What changes while it is off: a new request under it is refused (400
  `<policy name> is no longer in use.`), and `accounting_pto_balances_list` lists ACTIVE
  policies only, so its balance rows drop out of the list until it is reactivated. A request
  that was already pending can still be approved, and that approval is NOT balance-checked
  (there is no balance row to check it against) - the balance judgment there is yours to put
  in front of the approver.

## Balances (`accounting_pto_balance_set` and `accounting_pto_balances_list`)

**A balance is for the calendar year**: carried in from last year + granted this year +
accrued so far this year (day by day from January 1, or from the day the member was added if
later, and stopping at the policy's `max_balance_minutes`) less the leave approved this year.
`accounting_pto_balances_list` returns one row per member and ACTIVE policy with every part:
`granted_minutes`, `carried_in_minutes`, `accrued_minutes`, `accrual_capped` (the cap held
some accrual back), `used_minutes` (approved leave starting this year), `pending_minutes`
(requested, not yet decided), `available_minutes` (carried in + granted + accrued - used; the
same figure also comes back as `remaining_minutes`) and `unlimited`. A policy with no accrual,
no grant and nothing carried in reads `unlimited: true` and is never balance-checked; such a
row appears only once the member has leave used or pending under it. Archived members are not
listed.

`accounting_pto_balance_set({ member_id, policy_id, granted_hours, year? })` sets the hours
GRANTED for one year - not the balance. `year` may be last year, this year or next (400
otherwise) and defaults to this year. It is an **absolute SET for that year, not a top-up**:
that year's previous grant is overwritten and no history row is kept, so a second call with a
smaller number silently erases the first; other years' grants are untouched.
**Read-before-set, always**: `accounting_pto_balances_list` first, state "granted for <year>
moves from X to Y hours", get the yes, then set. The returned row carries `granted_minutes`
and `year` and no used or available figure - the balances list recomputes those at read time
from this year's approved leave, so a wrong USED figure can only be corrected by cancelling
the request behind it, never here. Granting under a deactivated policy succeeds but shows in
no balance row until the policy is reactivated. Not idempotency-wrapped; safe to retry only
because the write is an absolute set.

## Requests

- `accounting_pto_request_create({ member_id, policy_id, start_date, end_date, hours, note? })`
  - status is hardcoded `pending`; a pre-approved request cannot be created here. Dates as
  plain `YYYY-MM-DD` (an unparseable string is 400 `Invalid dates`; a full ISO timestamp is
  accepted and its time discarded). **The request is validated.** 400 for: an end before
  the start (`The leave ends before it starts.`), hours of 0 (`Enter the hours of leave.`),
  more hours than the days hold (24 per day), a member who is inactive or archived
  (`<name> is not an active member.`) and a policy that is inactive (`<policy name> is no
  longer in use.`). 409 when it does not fit what is left this year after the requests
  already pending - the message states what is left and ends `Grant more time, or shorten
  the request.` Do neither on your own: that choice is the owner's. Two things are still NOT
  checked: overlapping dates with another request, and the balance of leave that starts in
  any calendar year but the current one (next year's balance is not known yet). Read
  `accounting_pto_balances_list` first. Idempotency-wrapped.
- `accounting_pto_request_review({ request_id, action })` - `action` is `approve | deny |
  cancel`; anything else is 400 and every other body key is dropped. **A request moves only
  pending -> approved / denied / cancelled, and approved -> cancelled.** Anything else is 409:
  an approved request answers `This request is already approved. Cancel it instead.`, a
  denied or cancelled one `This request is <status>, so it can no longer change.` - a decided
  request is never flipped back, so a wrong denial is a NEW request. An approval is checked
  against this year's balance again and refused 409 when it no longer fits (other pending
  requests do not count against it). The write is conditional on the status you read: when
  someone else decided it first the answer is 409 `This request was just changed. Reload and
  try again.` - re-read, never retry blind. `approved` is the only status that counts:
  approving moves `used_minutes` for the year the leave starts in, and cancelling an approved
  request gives the hours back.

## The approval procedure (the server checks the balance and the status; the yes is yours to get)

1. `accounting_pto_requests_list({ status: 'pending' })` - the queue.
2. `accounting_pto_balances_list` - the decision is against a real available balance. An
   approval that does not fit this year's balance is refused 409, so there is no approving
   into the negative: the way through is the owner granting more hours
   (`accounting_pto_balance_set`) or the member shortening the request - never a workaround.
   The server does NOT check leave that starts in another calendar year or sits under an
   unlimited policy; there the balance judgment is still yours to put in front of the
   approver.
3. A NAMED human approves or denies each request - never approve on your own judgment, and
   never batch-approve ("approve all the PTO" gets the queue listed per member with balances,
   not a loop of approvals).
4. **`reviewed_by_user_id` is forced to NULL on this service-key route - the system records no
   approver.** So YOU record it: log who approved what to department memory or the PM task,
   every time. Without that line there is no audit trail at all.
5. **A decision has two consequences downstream.** The person is told: a notice of the
   decision (approved, declined or cancelled) goes to the member's own Hiveku user, in the
   app and by email or push as their settings allow - a roster row with no linked user has
   nobody to notify, so tell that member yourself (via the owner). And approved PAID leave is
   pay: an hourly member's payroll run for those days pays the leave as hours at their rate.
   So approve leave BEFORE the run for its period is generated (a draft built earlier needs
   Recalculate in the dashboard to pick it up), and never also log the leave as a time
   entry - that pays it twice.
