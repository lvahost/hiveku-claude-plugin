# Reference: Deals to the ad platform (offline conversion upload)

This file covers the lane that takes a closed deal, a won call, or a commerce order in Hiveku and
pushes it back to the ad platform as an offline conversion, so Smart Bidding optimises toward
revenue instead of toward form fills. Load it when a client says "we closed real money from Google
Ads and the platform does not show it", when you are asked to turn offline conversions on, when you
are wiring or auditing a conversion action or a Bing goal, or when a batch came back `skipped` or
`failed`. It assumes you already ran `account_context_get` and know the click-side chain (embed,
form ledger, DNI) from the main skill. This is a refusal-first system: the pipeline returns reasons,
it does not throw, and the job is almost always to read a reason and clear it, not to retry.

---

## 1. The two lanes

**Lane A - CRM and commerce.** Sources `crm_deal_won`, `form_lead`, `shopify_order`. A Hiveku record
is matched back to a click id stored on the contact and uploaded with a value.

**Lane B - voice and calls.** A tracked call attributed through the DNI pool session. The click id
comes from `voice_pool_sessions` (gclid/gbraid/wbraid/fbclid/msclkid/ttclid plus utm, referrer,
landing url, ga_client_id, ad_consent), not from the contact's own columns.

Lane A dies on **missing click ids and missing value**; Lane B dies on **missing capture at swap
time**. Read Lane B with `marketing_call_attribution_breakdown` and `marketing_call_attribution_list`;
read Lane A's form half with `marketing_form_conversion_audit`.

Lane B has its own doctor: **`voice_call_tracking_diagnose`** returns seven checks
(`ok | warn | fail | unknown` each) plus an ORDERED `fix_first` list - read `fix_first`, and an
`unknown` is NOT a pass. **`voice_call_tracking_outbox`** then shows the upload rows one at a time
with each `error_code` translated (filter `status: 'failed'` first; an empty result means either
nothing was ever enqueued - a tracking problem - or everything uploaded cleanly).
`analytics_channel_scorecard`'s call reconciliation causes and `voice_diagnose_setup`
(`blocking_issues[]`) remain the channel-level views. The calls reference, section 9, carries the
family in depth, including `voice_call_tracking_setup`, the wiring tool whose `did_count` field
spends money.

---

## 2. The two hard gates

Nothing uploads unless BOTH are true. There is no implicit default anywhere in this system.

**Gate 1 - the account opted in.** The offline-conversion setting must be enabled, a deliberate
per-account switch. A new account is OFF, and every candidate then returns `not_opted_in` with zero
API calls made. Not a bug and not a permissions error: somebody has to decide this account sends
customer conversion data to an ad platform. For Lane A (deals, forms, orders) no MCP tool flips it -
it is a dashboard setting. For Lane B, the CALL lane's tenant opt-in
(`voice_tenant_config.conversion_upload_enabled`) is one of the steps `voice_call_tracking_setup`
wires - still a deliberate, confirmed decision, never a silent side effect of "fixing tracking".

**Gate 2 - a designated conversion action the connection's own ad account owns.** A mapping row must
exist for that (connection, source) pair with `enabled = true`, naming a conversion action an
operator explicitly designated, and that action must belong to the ad account behind that connection.
Ownership is verified, not assumed: borrowing an action from a sibling MCC account or the agency's
own account fails.

Both gates are per (account, connection, source). Turning on `crm_deal_won` for Google does **not**
turn on `form_lead` for Google and turns on nothing for Microsoft. Each pair is its own decision and
its own confirmation.

---

## 3. What `conversion_action` MEANS on each platform

The most common setup error: same field name, a different kind of string per platform.

| Platform | `conversion_action` is | Shape | Read it from |
|---|---|---|---|
| `google_ads` | a ConversionAction **resource name** | `customers/1234567890/conversionActions/987654321` | `ppc_conversion_actions_list` |
| `microsoft_ads` | the offline conversion **goal NAME**, exact match against an existing OfflineConversionGoal | `Hiveku Offline Deal Won` | `ppc_bing_conversion_goal_list` |
| `meta_ads` | the CAPI **event name** | `Lead`, `Purchase` | `ppc_meta_custom_conversions` |

Google wants the id-bearing resource name, not the display name. Pasting the human name fails
ownership verification rather than string matching, so it returns `conversion_action_not_owned` and
reads confusingly. On that reason, check the SHAPE first.

Microsoft matches on the goal's name string, so **a rename in the Microsoft Advertising UI silently
breaks a working mapping.** If a Microsoft lane stopped working, list goals with
`ppc_bing_conversion_goal_list` and compare the name character for character before anything else.

Meta: **Hiveku sends only the `fbc` parameter.** Enhanced matching (hashed email or phone) is refused
outright with `policy_no_pii`. Never promise a client Meta offline conversions matched on customer
email through this lane.

---

## 4. Windows, guards, exact numbers

| Guard | Value | On violation |
|---|---|---|
| Click window: google 90d, microsoft 90d, linkedin 90d | 90 days | `stale_click` |
| Click window: meta 7d, tiktok 7d | 7 days | `stale_click`, plus `meta_stale` on Meta |
| Import max age (conversion age) | 63 days, Google's horizon | `conversion_too_old` |
| Minimum upload delay | 6 hours after the conversion | `TOO_RECENT_*` |
| Maximum conversion value | 1,000,000 | `value_above_max`, **REFUSED, never clamped** |
| Chunk size | 200 rows | rows split, status per row |

**The 6-hour floor is a floor, not a suggestion.** A deal closed 40 minutes ago returns
`TOO_RECENT_*` and does not go. Honest answer to "can Smart Bidding see this today": earliest six
hours after the win, and you should be batching daily anyway. Daily batching is a standing job, not
a habit: build it as a scheduled workflow (`workflow_` tools, or `/hiveku:automate`) so Meta's
7-day window stops eating conversions the week someone is on vacation - the interactive two-step
confirm below still governs any batch YOU run by hand.

**Value above 1,000,000 is refused, not clamped.** A misplaced decimal, a value in cents, or a JPY
amount uploaded as USD gets a hard refusal instead of a capped upload. Correct: a clamped 1,000,000
conversion would poison tROAS for weeks. Look for a unit error before assuming a real megadeal.

Row statuses: `queued | validated | uploaded | failed | skipped`. `skipped` carries a refusal reason
and is where you spend your time. `failed` is a platform-side error on a row that passed our gates.

---

## 5. Dating the click (the whole ballgame)

A conversion is only acceptable if it ties to a click, and the click must be dated so the platform
can verify the conversion did not precede it and fell inside the window. A wrong timestamp is worse
than no upload.

**1. Pick the click id. CURRENT touch wins over first touch**, and within Google
`gclid` > `gbraid` > `wbraid`. `crm_contacts.gclid` and `.click_ids` hold CURRENT;
`.original_gclid` / `.original_click_ids` hold the write-once FIRST touch. The lane uses current
deliberately: the click that actually preceded the win is the more recent one.

**2. Date it from `source_history`.** Take the LATEST `crm_contacts.source_history[]` entry carrying
that exact click id value. `source_history` is the append-only dated audit trail and **the only place
in the entire system that knows WHEN a click happened.** Neither `gclid` nor `click_ids` carries a
timestamp. No matching entry means the CRM cannot date this click.

**3. Fall back to `contact.created_at`.** It is at or BEFORE any click on that contact, so standing
in for the click instant it dates the click EARLIER than it really was, which **over-states the
click's age**. An over-stated age can only push a row past a window boundary, never pull one back
inside, so the fallback **refuses more rows than it strictly should, never fewer.** A genuinely
in-window click can be rejected as `stale_click` purely because the contact record is old. Deliberate
trade: a false refusal costs one conversion, a false acceptance corrupts a live bidding system.

**`updated_at` is explicitly rejected as a dating proxy.** Any unrelated edit (a tag, a note, a
workflow touch) moves it, so it would date the click as whenever somebody last opened the contact.
Never substitute it, never offer it as a workaround.

**Read `dated_by` on every row.** A batch dominated by the `created_at` fallback says
`source_history` is thin here: a click-side capture problem (embed freshness, consent gate,
localStorage unavailable), not an upload problem. And a `stale_click` refusal does not prove the
click was old, only that a fallback-dated contact predates it. Check `dated_by` first.

---

## 6. Dating the deal win

**`crm_deals` has no `won_at` column.** There is no single field. Priority order:

1. An audit-log `crm.deal.won` event. The real thing: a recorded transition.
2. The latest `stage_history.entered_at`. Dates the last stage entry, which is the win only if the
   win was the last stage change.
3. `updated_at`, **last resort and flagged as such.** Same weakness as above.

With the 63-day horizon and the 6-hour floor, an `updated_at`-dated deal can fall outside the window
because nobody touched the record for two months, or be refused as `conversion_in_future` /
`conversion_precedes_click` because an edit happened after the fact. Those two reasons together
strongly suggest `updated_at` dating: check whether the account produces `crm.deal.won` audit events
at all.

**"Won" is the account's own vocabulary.** No hardcoded `'won'` string: the pipeline reads that
account's deal statuses flagged `is_won`. An account with no `is_won` status yields **zero candidate
deals**, not a guessed set. This is the most confusing ticket in the product: offline conversions on,
mapping valid, connection healthy, preview empty. Before debugging anything else, confirm at least
one deal status carries `is_won`. If none does, that is the fix, and it is a one-time CRM settings
change, not a pipeline issue.

---

## 7. Ad consent is a TRI-STATE

Not a boolean: `false` = explicitly opted OUT (suppress); `true` = granted (upload); `null` = **no
signal was ever collected**, which is not a denial.

**Only the form-lead collector sets it.** Not an oversight: consent is a browser-side signal, and a
form submission is the only one of these events happening in a browser where the signal exists. A
deal closed by a salesperson on the phone, and a Shopify order placed through another checkout, leave
ad consent undefined **by design**.

Resolution is per contact across every submission that contact ever made, **newest explicit signal
wins**: denied in March, accepted in July resolves to accepted; all nulls resolves to null. An
explicit denial suppresses `google_ads`, `microsoft_ads` and `meta_ads`, but **not GA4**. The reason
is `ad_consent_denied`.

Never treat `null` as denial and quietly drop rows, and never treat `null` as consent where the
client has said otherwise. If asked whether uploading a deal with no consent signal is compliant, the
technical answer is "no consent signal was ever collected for that contact, because the conversion
did not originate in a browser session we instrumented"; the compliance answer is their counsel's.

---

## 8. Every refusal reason and what to actually do

Returned, never thrown, and shown verbatim in the dry-run preview. Work them in this order: gates,
identity, dating, value. Reasoning for the gate and dating rows is in sections 2, 5 and 6.

| Reason | Do this |
|---|---|
| `not_opted_in` | Account switch off. Explain the data-sharing decision and get a yes FIRST. Lane A: enable in the dashboard (no tool). Call lane: `voice_call_tracking_setup` wires the tenant opt-in - dry_run first, and never as a workaround for the yes. |
| `source_not_designated` | No mapping row for this (connection, source). Create it, designate an action. |
| `mapping_disabled` | `enabled = false`. Find out who turned it off, then flip it on deliberately. |
| `unsupported_platform` | No upload lane there. Do not retry. |
| `no_connection` | Reconnect, then `ppc_digest` for sync freshness. |
| `conversion_action_not_owned` | Belongs to another ad account. On Google check it is a resource name, not a display name. Re-pick from `ppc_conversion_actions_list`. |
| `conversion_action_changed` | Renamed, deleted or swapped platform-side. Re-designate. On Microsoft, usually a goal rename. |
| `connection_account_mismatch` | Connection points elsewhere now. Rebuild the mapping against the current ad account. |
| `no_click_id` | Upstream capture problem, not an upload problem. Run `analytics_diagnose_tracking` and `marketing_form_conversion_audit`; check whether the click id sat in the landing URL but never reached `utm_params`. |
| `no_hashed_identifier` | None exists. Not fixable per row. |
| `no_contact` | Deal has no linked contact. Fix CRM linkage. |
| `ad_consent_denied` | Explicit opt-out. Do NOT override. Leave it. |
| `policy_no_pii` | Meta enhanced match_mode requested; Meta is fbc-only. Drop enhanced matching. |
| `match_mode_changed` | Changed since queueing. Re-validate the mapping, re-run. |
| `stale_click` | Outside the window. Check `dated_by` first: on a `created_at`-fallback row this may be a false refusal from an old contact record. |
| `meta_stale` | Meta's 7-day horizon. Only cadence fixes it: batch Meta daily, never weekly. |
| `stale_conversion` / `conversion_too_old` | Past 63 days, unrecoverable. Change cadence so it stops recurring. |
| `conversion_precedes_click` | Bad dating on one side. Check for `updated_at` dating. |
| `conversion_in_future` | Clock or timezone error, or an `updated_at`-dated deal edited later. Check the offset. |
| `TOO_RECENT_*` | Under the 6-hour floor. Wait and re-run. Never a config problem. |
| `no_value` | No amount on the deal. Either they populate deal values, or ROAS reporting is off the table. |
| `invalid_value` | Non-numeric or malformed. Data hygiene. |
| `value_above_max` | Over 1,000,000, REFUSED not clamped. Look for cents-vs-dollars or a currency mixup first. |
| `already_enqueued` | Idempotency working. Do not force. Check the earlier row's status. |
| `error` | Genuine failure. Read the row detail; never blanket-retry a batch on this alone. |

---

## 9. Dispatch-time re-checks

The gates are not evaluated once. A row that passed the preview is checked AGAIN at dispatch, which
is why the `_changed` reasons exist at all (`conversion_action_changed`, `match_mode_changed`)
alongside `connection_account_mismatch` and `already_enqueued`. Between preview and dispatch somebody
can rename a Microsoft goal, delete a Google action, reconnect under a different customer id, or
another path can enqueue the same conversion.

- **A clean preview is not a guarantee.** Report previewed rows as "eligible", never "will upload".
- **Do not re-run a whole batch because some rows came back `_changed`.** Fix the mapping, then
  re-run. `already_enqueued` protects rows that landed, but a forced re-run muddies the audit trail.
- **Do not change anything platform-side between preview and confirm.** If a conversion action was
  edited after previewing, throw the preview away and preview again.

---

## 10. `ppc_offline_conversion_upload` in depth

**Google Ads only.** Against a Microsoft, Meta, LinkedIn or TikTok connection it returns a
wrong-platform error, **not an empty result**. An empty-looking response on the wrong platform is
never "nothing matched": read the error.

**The two-step confirm is the entire safety model.**
1. **First call, no `confirm`.** Returns a dry-run preview with `requires_confirm: true` and
   **uploads nothing**. It carries per-row refusal reasons verbatim.
2. **Second call, IDENTICAL arguments plus `confirm: true`.** This one uploads.

Identical arguments matter: changing the entry set between calls means you confirmed a preview the
human never saw, so dropping refused rows or fixing a value is a NEW preview and a new confirmation.
Never skip step one to save a turn, and never confirm without showing the human the eligible count,
total value and currency, the conversion action being written to, and the refusal breakdown. This is
money entering a live bidding system.

**Required argument shapes**, per entry:
- **`gclid`** (preferred) **or `order_id`.** Prefer `gclid` whenever a click id exists; `order_id` is
  the commerce join key.
- **`conversion_date_time`** as the exact string `'YYYY-MM-DD HH:MM:SS+HH:MM'`. The offset is
  **required**. No `T` separator, no `Z`. A wrong offset is the quiet cause of
  `conversion_precedes_click` on a same-day win.
- **`conversion_value`** - numeric, under 1,000,000.
- **`currency_code`** - ISO code, matching what the deal value actually is.

**The Ads UI requirement nothing in Hiveku can fix.** The conversion action must exist AND be
configured with source **Upload** in the Google Ads UI (Conversions, New conversion, **Import**). A
WEBPAGE-source action will not accept uploaded clicks, and no tool flips an existing action's source:
it is set at creation. If the designated action was created as a website conversion, create a new
Import-source action with `ppc_google_conversion_actions` (`type_: 'UPLOAD_CLICKS'`, or
`UPLOAD_CALLS` for the call lane) and re-designate the mapping to it.

**Partial failures.** Results come back **per row**; the batch is not atomic. Expect a mix of
`uploaded`, `skipped` with a reason, and `failed`. Report all three counts. Never describe 40 uploads
and 12 skips as "the upload failed", and never as "done" without naming the 12.

`ppc_customer_match_upload` (audience lists) is under the same strict two-step contract: preview,
show, confirm.

---

## 11. Conversion action and goal CRUD, per platform

### Google

- **`ppc_conversion_actions_list`** (Google only). id, name, status ENABLED / REMOVED / HIDDEN,
  category, counting type ONE_PER_CLICK / MANY_PER_CLICK, attribution model, lookback windows, value
  settings, type, origin, `primary_for_goal`. Where you get the resource name for a mapping.
- **`ppc_conversion_tracking_status`** (Google only). `action_count`, `enabled_count`,
  `silent_count`, per-action list, `warnings[]`. It now sees dead tags (a date-segmented query
  returns no row for a zero-conversion action, so the old single query omitted exactly the actions
  worth reporting), so a **higher** `enabled_count` / `silent_count` than last month is the fix
  working, not a regression. Read the two numbers correctly: **`conversions` counts only actions in
  the Conversions column that Smart Bidding optimises on; `all_conversions` counts everything, and
  silence is judged on `all_conversions`.** `conversions: 0, all_conversions: 50` is a secondary
  action recording fine, NOT a dead tag.
- **`ppc_google_conversion_actions`** (create, get-tag, update):
 - **`type_` carries a trailing underscore.** `WEBPAGE | UPLOAD_CLICKS | UPLOAD_CALLS | AD_CALL |
    WEBSITE_CALL | CLICK_TO_CALL`. This lane wants `UPLOAD_CLICKS` (deals) or `UPLOAD_CALLS` (calls).
 - `include_in_conversions_optimization: false` makes it **reporting-only, excluded from Smart
    Bidding.** True if offline deals should change bidding, false to observe without disturbing a
    working campaign. Say which you chose.
 - `phone_call_duration_seconds`: calls shorter than this record **NOTHING**. Set it to the
    account's real qualification threshold; set too low, it is the same threshold that makes a
    12-second wrong number a conversion.
 - **`always_use_default_value: true` FLATTENS every conversion to one number and destroys
    transaction-level revenue reporting.** tROAS then bids against a constant, indistinguishable from
    having no value-based bidding while looking like you do. Never set it on a revenue lane; if a
    client asks for it, confirm explicitly.

### Microsoft (Bing)

- **`ppc_bing_conversion_tracking_status`** - UET tags and install state, goals and recording state,
  `ready_for_conversion_bidding`, plain-language verdict. **Run it BEFORE switching any campaign to
  max_conversions, target_cpa or target_roas**: the bidding tool refuses without a bidding-eligible
  goal, so checking first saves a failed change.
- **`ppc_bing_uet_tag_list`** / **`ppc_bing_uet_tag_create`** - a tag not "recording" means the site
  snippet is missing or broken, the **number one reason a Bing account reports zero conversions**.
- **`ppc_bing_conversion_goal_list`** - the exact goal NAME a Microsoft mapping needs.
- **`ppc_bing_conversion_goal_create`** - `goal_type` is `url | event | duration |
  pages_viewed_per_visit`; **`tag_id` required on all of them**; `url` needs `url_expression`;
  `event` needs at least one of category / action / label; and **`goal_category` is required on url
  and event goals** (omitting it is the usual reason the call bounces).

### Meta, LinkedIn, TikTok

- **`ppc_meta_custom_conversions`** - what exists, with `last_fired_time` **per conversion** (a
  pixel-grain check cannot tell a dead LEAD from a live PURCHASE, since one pixel serves every
  conversion). An empty list means no CUSTOM conversions are defined, **not** a failed read; a failed
  read returns `readability` / `coverage_gap` and never an empty list.
- **`ppc_meta_conversion_volume`** - `attributed_conversions`, deliberately not merged with
  `last_fired_time`: fired recently with zero attributed is a **media finding**, not a tracking
  failure, and merging them would hide that.
- **`ppc_linkedin_conversions`** / **`ppc_tiktok_conversions`** read configured conversions. Neither
  has an offline upload lane: `ppc_offline_conversion_upload` is Google-only.
- **`ppc_digest`** before trusting any platform number: it warns on connections stale by more than 25
  hours. "The platform shows 3" against a connection that synced two days ago is not yet a finding.

---

## 12. Worked play: "we closed 15 deals from Google Ads last month and the platform shows 3, fix it"

Do not start uploading. Find out which of five problems this is.

**0. Context and freshness.** `account_context_get`, then `ppc_digest`. If the Google connection is
stale by more than 25 hours, the "3" may simply be unsynced.

**1. Platform verdict, once.** `analytics_channel_scorecard` (needs a custom domain). Slow: call it
ONCE, never in a loop. Relay the Google row's `headline` **verbatim**, it carries the number that
makes the problem undeniable. Read `hiveku_recorded` vs `platform_recorded`, `missing`,
`how_we_know`, `how_to_fix`, `conversion_actions[]`. Two traps:
**`conversion_actions_window_days` is fixed at 30 and does not follow `days`**, so never compare it
against a 60-day request; **`conversions_last_30_days: null` means we could not read it, never zero.**

**2. Which half is broken?** Web-side (the conversion never fired) or offline-side (the deal never
uploaded). The scorecard's call reconciliation causes name the offline ones: `upload_disabled |
no_click_id_captured | outbox_stuck | action_missing | action_disabled | action_not_counted |
no_upload_lane | platform_unreadable`. Web-side means this is not an offline-upload job: go to
`analytics_diagnose_tracking` (custom domain required, 400 without one) and work `tag-not-deployed`,
`conversion-never-fires`, `conversion-fires-denied`, `duplicate-conversion-paths`. Committing is not
deploying. For `upload_disabled` / `action_missing` / `action_disabled`, continue here.

**3. The two gates.** Account opted in? Enabled mapping for `crm_deal_won` on the Google connection
naming an owned action? Confirm with `ppc_conversion_actions_list` (status ENABLED, resource name
matches the mapping) and `ppc_conversion_tracking_status` (silent?, judged on **`all_conversions`**).

**4. The vocabulary.** Any deal status flagged `is_won`? If not, the pipeline has yielded zero
candidates all along and no connection work changes that. Five-minute fix, and frequently the answer.

**5. Dry run, then read the reasons.** `ppc_offline_conversion_upload` with **no `confirm`** gives a
per-row truth table for the 15. Bucket the refusals:
- Mostly `no_click_id`: a capture problem, not an upload problem. Cross-check
  `marketing_form_conversion_audit` (trap: **`clicks_before_range: 0` when `click_dated` is 0 means
  NOT MEASURABLE, not zero**) and, for calls, `marketing_call_attribution_list`. Fix the embed,
  consent gate or hostname registration upstream and stop promising all 15.
- Mostly `stale_click` with `dated_by` on the `created_at` fallback: conservative refusals from old
  contact records, not old clicks. Recovering them would need `source_history` to have dated the
  click, which it did not.
- Mostly `no_value`: no deal amounts in the CRM. Either they populate them or ROAS is off the table.
- `conversion_too_old`: past 63 days, gone forever. Move to a daily or weekly cadence.
- Gate reasons: clear per section 8, then preview again.

**6. Confirm and upload.** Present eligible count, total value, currency, the conversion action
resource name being written to, and the refusal breakdown. Get an explicit yes. Repeat the
**identical** call with `confirm: true`. Report per-row outcomes: uploaded, skipped, failed.

**7. Expectations and close-out.** The 6-hour floor plus platform processing means "check tomorrow",
not "refresh now". Verify next day with `ppc_conversion_tracking_status` on that action, judged on
`all_conversions`. Record the decision (action, mapping, cadence) with `memory_create`, and file the
cadence and upstream capture fixes as `pm_tasks_create` items.

**The honest answer this play usually produces:** of 15 deals, some never had a click id and can
never be uploaded, some are past the 63-day horizon and are gone, and the rest are recoverable now.
Give those three numbers separately. "We recovered 9, 4 have no click id because of a consent-gated
embed we are fixing this week, and 2 closed 71 days ago and are outside Google's import window" is a
report worth paying for. "It is fixed" is not.

