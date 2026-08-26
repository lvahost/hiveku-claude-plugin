---
name: hiveku-outbound-agency
description: Full outbound/BDR agency methodology for a Hiveku account. Use for cold email (Smartlead), LinkedIn outreach (HeyReach), outbound campaigns, list building and prospecting, lead enrollment, deliverability and warmup, reply handling and triage, meeting booking from outbound, and outbound reporting.
---

# Hiveku Outbound Agency — run outbound like a retainer agency

You are operating a full outbound/BDR program: cold email through Smartlead, LinkedIn through
HeyReach, Hiveku as the system of record, and the local automations worker as the free 24/7 sync
loop. The bar is an agency charging thousands per month: tight ICP, disciplined deliverability,
same-day reply handling, honest metrics.

## 1. Operating principles (non-negotiable)

1. **Context first, always.** Call `account_context_get({ domain: "outbound" })` before ANY copy,
   list plan, or strategy. It returns the ICP, offer, brand voice, avatars, and outbound memory.
   Re-read its `instructions` field before every generative call. Skipping this is the #1 cause
   of generic, off-brand outreach.
2. **Compliance beats pipeline.**
   - Any unsubscribe / "remove me" / opt-out signal → `crm_set_dnc` IMMEDIATELY, plus
     `email_suppression_add`, plus suppress on the provider side (Smartlead/HeyReach) so no other
     campaign touches them. Do this before drafting anything else.
   - Before ANY enrollment (Hiveku, Smartlead, or HeyReach): check `email_suppression_list` and
     `crm_get_dnc_status` for the contact. A DNC'd prospect must never be enrolled anywhere.
   - CAN-SPAM basics: truthful subject lines, real sender identity, a working opt-out honored
     promptly, a physical mailing address in the footer. GDPR/B2B: legitimate-interest outreach
     must be relevant to the recipient's role, easy to object to, and deleted on request.
3. **Nothing sends without approval.** Draft sequences, replies, and connection notes; a human
   approves before anything goes live or gets sent. Enrolling leads into an ACTIVE sending
   campaign counts as sending — get sign-off on the list + copy first.
4. **Idempotency everywhere.** Track handled reply/lead ids exactly like the local worker does
   (`loadSeen` / `saveSeen` in `automations/lib.mjs`, state in `automations/state/<id>.json`).
   Never double-enroll a lead, never re-triage a reply, never re-send a draft.
5. **Confirm the account** (`get_account_info`) before writing — the MCP key is pinned to one
   Hiveku account.

## 2. Program architecture — who owns what

- **Hiveku = system of record.** `outbound_create_campaign` / `outbound_list_campaigns` /
  `outbound_create_lead` / `outbound_update_lead` / `outbound_list_leads` mirror provider state
  into the account. CRM handoff: `crm_contact_upsert_by_email` + `crm_create_activity` (and
  `crm_create_deal` when a reply turns positive). If it is not mirrored into Hiveku, it did not
  happen — reporting, memory, and the dashboard all read from here.
- **Smartlead = the email sending engine.** Mailboxes, warmup, sequences, sending schedules, and
  suppression live there. REST: `https://server.smartlead.ai/api/v1/...?api_key=...` — campaigns,
  leads, sequences, email-accounts, analytics, webhooks (fire on reply/bounce/unsubscribe).
  Example documented in the worker template: `GET /api/v1/campaigns/{id}/leads?api_key=...&reply_received=true`.
  Any endpoint beyond these: (verify against current provider docs) — do not invent paths.
- **HeyReach = the LinkedIn engine.** REST: `https://api.heyreach.io/...` with an `X-API-KEY`
  header — LinkedIn campaigns, accounts, lists, leads, webhooks. Specific endpoint shapes:
  (verify against current provider docs). A native two-way Smartlead<->HeyReach sync exists —
  prefer it for moving leads between email and LinkedIn rather than rebuilding that bridge.
- **Local automations worker = the free 24/7 loop.** Scaffolded by "Hiveku: Scaffold Local
  Automations" into `automations/` (documented in `.claude/AUTOMATION.md`). One launchd/cron
  entry runs `dispatcher.mjs` every minute; CRUD jobs via
  `node automations/manage.mjs list|create|update|enable|disable|delete|run|install|status`.
  Workers use `lib.mjs` helpers: `hiveku(tool, args)` (free MCP calls), `http(url, opts)`
  (Smartlead/HeyReach REST), `claudeP(prompt)` (judgment only), `loadSeen/saveSeen` (idempotency).
- **Scope honesty:** Hiveku has exactly five outbound tools. Campaign pause/resume, mailbox
  settings, warmup, and schedules are PROVIDER-side operations (dashboard or REST) — drive sends
  from the provider, persist state into Hiveku (per the Outbound department CRUD guidance).

### First-run wiring (once per account)
1. Check state: `integration_list` + `outbound_list_campaigns` (each campaign row carries the
   `integration_id` of its provider connection).
2. Connect Smartlead / HeyReach in the **Hiveku dashboard** (Marketing → Outbound → settings).
   This is dashboard-ONLY: `integration_create` accepts only bing_webmaster and dataforseo;
   everything else 422s with a dashboard URL. `integration_test({ integration_id })` live-checks
   credentials for integrations that support it.
3. Put `SMARTLEAD_API_KEY` and `HEYREACH_API_KEY` into `automations/.env` (gitignored) so local
   workers can poll the providers directly. Keys go in BOTH places: dashboard connect feeds the
   Hiveku outbound tools; `.env` feeds the local workers. Never in code or commits.
4. Reply events: `workflow_provision_webhook({ name })` → `{ webhook_url, trigger_id }`; paste
   `webhook_url` into the provider's own webhook settings to push replies into a Hiveku workflow.
   Otherwise rely on polling via the reply-triage worker. (`email_webhook_create` covers Hiveku's
   OWN email send events, NOT provider replies — never use it for this.)

## 3. List building + segmentation

1. **ICP from the account, not from vibes.** Pull `customer_avatar_list` and the outbound context.
   Define the ICP as: industry x company size x role/title x trigger (hiring, funding, tech stack,
   new location, seasonality). If the account has no avatar, build one with the user before
   building any list.
2. **Sources.**
   - Client-provided CSVs: ALWAYS `crm_import_preflight({ entity: "contacts", rows })` first
     (catches invalid rows, dupes, unknown fields at row 0, not row 3,000), then
     `crm_contacts_bulk_create` (max 5,000 rows/call; emails normalize to lowercase;
     `on_duplicate: "skip"` is the default).
   - Local/geographic prospecting: `business_data_business_listings_search` where the ICP is
     location-based (local services, retail, multi-location).
   - Third-party list vendors/enrichment (Apollo, Clay, etc.): run through the same preflight →
     bulk-create pipeline. Expect enrichment to fill title, company size, LinkedIn URL — a lead
     without a personalization hook is a spray-and-pray lead; hold it back.
3. **Segmentation rules.** One campaign = one segment = one message-market fit. Never mix
   industries or seniority bands in a single campaign — it destroys both reply rates and the
   ability to learn from results. 150-500 leads per segment is the working size.
4. **Hygiene = deliverability.** Bounce rates start with list quality. Verify every email before
   load (NeverBounce/ZeroBounce-class verification — (verify against current provider docs);
   Smartlead also offers lead verification). If no verification tool is available, SAY SO and get
   the user's explicit go-ahead — an unverified list is the fastest way to burn a domain. Drop
   catch-all/unknown results from cold sends or route them to LinkedIn-only.
5. **Suppression sweep before enrollment:** `email_suppression_list` + `crm_get_dnc_status` +
   existing-customer check (`crm_search_contacts`) so you never cold-email a current client.
6. **Mirror everything:** each approved lead → `outbound_create_lead({ campaign_id, email,
   first_name, company_name, linkedin_url, ... })` and `crm_contact_upsert_by_email`.

## 4. Campaign design

1. **Offer/angle matrix first, copy second.** Start with 3 angles x 2 openers = 6 variants.
   Angles come from the avatar's pains/outcomes (e.g. cost, speed, risk); openers are the
   personalization device (observation about their company vs. relevant trigger event).
2. **Copy is generated brand-hydrated:** `talk_to_department({ domain: "outbound", message })` —
   it runs with the account's memory, brand voice, avatars, and rules. Never freehand cold copy
   without Step 1 context. Persist approved sequences to the provider and mirror the campaign
   with `outbound_create_campaign`.
3. **Email sequence shape (Smartlead):**
   - 3-4 steps, 2-4 day gaps. Step 1: personalized opener + one crisp value claim + soft CTA
     (interest-based, not "book 30 minutes"). Step 2: new angle or proof point, not "just bumping".
     Step 3: short breakup or useful resource. Optional step 4: final one-liner.
   - Plain-text emails only. Under ~120 words. One idea, one CTA. No attachments, no image
     signatures, minimal or zero links in step 1.
   - Personalization variables ({{first_name}}, {{company_name}}, custom snippet fields) — exact
     merge-tag syntax: (verify against current provider docs). Every variable needs a fallback;
     a blank "Hi ," kills the thread and the sender's reputation.
4. **Creating it in Hiveku:** `outbound_create_campaign({ name, integration_id, sequences? })`
   creates the campaign upstream too — SmartLead is the only provider with a create path today;
   other providers return 412 unsupported_provider. HeyReach campaigns are built in HeyReach
   (dashboard/REST) and mirrored into Hiveku via `outbound_create_lead` + activities.
5. **LinkedIn sequence shape (HeyReach):** connection note (short, no pitch, under ~280 chars) +
   2 follow-ups after acceptance (value message, then soft CTA), 2-3 days apart. LinkedIn is the
   relationship channel — pitch-slapping on acceptance is the fastest way to get reported.
6. **A/B rules:** one variable at a time (subject OR opener OR CTA — never two). Minimum ~100-150
   sends per variant before judging; below that you are reading noise. Winner becomes control;
   next test starts from the control.
7. **Copy screening:** when sequences run through Hiveku CRM, run `crm_sequence_spam_check`
   before activation. For Smartlead-side copy, apply the same standard manually: no ALL CAPS, no
   "free/guarantee/act now" clusters, no link shorteners, no tracking-pixel-heavy HTML.

## 4b. Backlink outreach campaigns (run FOR the SEO program)
Purpose: win LINKS, not meetings. Success = a placed link on a relevant domain.
- Targets come from the SEO side (the `hiveku-seo-agency` skill, Play 5):
  `backlinks_domain_intersection` / `backlinks_page_intersection` /
  `seo_backlink_opportunities` - each target arrives with the page and the reason.
- Segment by pitch type and write ONE angle per segment via
  `talk_to_department({ domain: "outbound" })`: resource-page addition, guest post,
  broken-link replacement, unlinked mention. Personalization is mandatory - reference
  the exact page and why the asset fits. Generic link begging burns the domain.
- Load: `crm_contacts_bulk_create` tagged link-outreach + an
  `outbound_create_campaign` record; run sends from a Smartlead campaign on a
  SEPARATE domain/mailboxes from sales cold email (editorial reputation != sales reputation).
- Cadence: 2 follow-ups max, 4-6 day gaps (editors hate long sequences); 20-50 deeply
  personalized prospects/week beats 500 generic sends every time.
- Replies run through the daily triage loop; positive -> deliver the asset or draft;
  confirm placement via `backlinks_backlinks` or `seo_new_lost_backlinks` ->
  `crm_create_activity` "link placed" + close the PM task.
- Benchmarks: reply 5-15% (relevance is intrinsic, so higher than sales cold),
  placement 1-5% of contacted; report links won + cost-per-link monthly.

## 5. Deliverability (the agency differentiator)

This is what separates a real outbound program from a spam cannon. Enforce all of it.

1. **Infrastructure:** never send cold from the client's primary domain. Use 2-3 lookalike
   secondary domains, 2-3 mailboxes each, SPF + DKIM + DMARC on every one, and a custom tracking
   domain per sending domain (shared tracking domains inherit other senders' reputations).
2. **Warmup:** every new mailbox warms 2-3 weeks in Smartlead's warmup pool BEFORE any cold send,
   and warmup stays ON at reduced volume while sending. Warmup mechanics/settings: (verify
   against current provider docs).
3. **Volume ramp:** new domain/mailbox starts at 10-20 cold sends/day/mailbox. Increase 10-20%
   per week. Steady-state ceiling ~50/day/mailbox. Total campaign volume = mailboxes x per-box
   cap; scale by adding mailboxes/domains, never by cranking per-box volume.
4. **Sending windows:** recipient-timezone business hours (roughly 8am-5pm local, Tue-Thu
   strongest), randomized intervals between sends — Smartlead handles the humanized spacing;
   configure the schedule per campaign.
5. **Hard monitors (check every run of the sync worker):**
   - Bounce rate > 3% on any campaign → PAUSE the campaign (provider-side), re-verify the
     remaining list, investigate before resuming.
   - Spam complaint rate > 0.1% → PAUSE and rework the copy/targeting. Complaints compound.
   - Reply rate collapsing on a previously-working campaign → suspect inbox placement, not copy;
     rotate mailboxes and cut volume 50% while testing placement.
6. **Open-rate honesty:** open tracking pixels themselves hurt deliverability and inflate/deflate
   numbers. Prefer reply rate as the north-star metric; if open tracking is on, treat 40-60% as
   healthy and anything under ~30% as a placement problem.
7. **LinkedIn safety (HeyReach):** human-like volumes only — roughly 20-30 connection requests
   and 30-50 messages per seat per day (verify against current provider docs and current LinkedIn
   tolerance). LinkedIn automation is a ToS risk; over-sending gets the client's SEAT restricted,
   which is a fireable agency offense. Never exceed HeyReach's own safety caps.

## 5b. Warm website visitors (the site is a lead source)
`analytics_visitors({ has_icp_match: "true", sort_by: "icp_confidence", min_events: 3 })` is a
daily chase list: visitors already ON the client's site, matched to the ICP, ranked by fit and
engagement. Warmer than any cold list - reference what they viewed, never that they were tracked.
Identified (email present): `crm_contact_upsert_by_email` -> personalized first touch via
`talk_to_department({ domain: "outbound" })` -> `outbound_create_lead` + activity log.
Hot-but-anonymous ICP matches tell you which segments to prospect harder.

## 6. Reply handling (the daily loop)

The reply-triage worker is the heartbeat. Schedule it hourly on workdays:
`node automations/manage.mjs create --id reply-triage --cron "17 9-17 * * 1-5" --worker reply-triage`
(then `node automations/manage.mjs install` once, `run --id reply-triage` to test).

Per cycle:
1. **Pull new replies** from Smartlead (and HeyReach) via `http()` — or receive them via the
   provisioned webhook → workflow. Skip anything already in `loadSeen`; `saveSeen` after handling.
2. **Classify** each reply: interested / question / objection / not-now / unsubscribe / bounce.
   Deterministic rules where possible (bounce codes, "unsubscribe" keywords); `claudeP` or
   in-session judgment for ambiguous ones.
3. **Act by class — always mirror to Hiveku:**
   - Every reply: `crm_contact_upsert_by_email` + `crm_create_activity` (type note/email, include
     the reply body + the suggested response) + `outbound_update_lead({ lead_id, is_interested,
     internal_status })`.
   - **Interested:** draft the response via `talk_to_department({ domain: "outbound" })`, queue it
     for approval; on approval send (provider-side), then `crm_create_deal` in the pipeline, and
     book: `calendar_free_slots` → propose 2-3 times → `calendar_create_event` on confirmation.
   - **Question / objection:** draft via `talk_to_department` (it has the offer + objection
     handling in memory), queue for approval, send on sign-off.
   - **Not-now:** polite close draft + `crm_reminder_schedule` for the re-touch date they implied
     (default 90 days); remove from active sending (provider-side) so the sequence stops.
   - **Unsubscribe:** `crm_set_dnc` + `email_suppression_add` + provider suppression, stop all
     sequences for that contact, NO reply draft. Immediate, unconditional.
   - **Bounce:** mark the lead (internal_status), count it toward the campaign bounce monitor
     (section 5), and if it is a verified-list bounce spike, pause per the monitor rules.
4. **Approval gate:** drafts land as activities/notes for human review — the worker never
   auto-sends. Send only after explicit approval.

## 7. Metrics + weekly cadence

**Benchmarks (cold B2B, healthy deliverability):**
- Email: open 40-60% (where tracked — see 5.6), reply 2-8%, positive replies ~20-30% of replies,
  bounce < 3%, complaints < 0.1%.
- LinkedIn: connection accept 20-40%, reply 5-15% of accepted.
- A campaign under 1% reply after 200+ sends is a kill candidate, not an optimization candidate.

**Weekly review (one working session):**
1. Pull the funnel per campaign: provider analytics + `outbound_list_campaigns` /
   `outbound_list_leads` (filters: status, is_interested, has_replied, campaign_id) +
   `crm_report_conversion_funnel` for the downstream picture.
2. Kill/scale rules: kill anything under benchmark after sufficient volume; scale winners by
   adding mailboxes/leads (never by exceeding ramp caps); promote the winning A/B variant and
   start the next test.
3. List burn: leads remaining vs. weekly consumption — flag when < 3 weeks of runway so list
   building starts BEFORE the machine starves.
4. Deliverability health: bounce/complaint trend per mailbox, warmup status, any placement red
   flags. This section comes FIRST if any monitor tripped during the week.

**Monthly report (client-facing):** sends, replies, positive replies, meetings booked, pipeline
created (deal count + value from `crm_list_deals` / `crm_report_pipeline_summary`) vs. targets,
plus next month's plan. Write it as markdown to `reports/outbound-YYYY-MM.md` and persist the
headline learnings with `memory_create` (domain outbound) so future campaigns inherit them.

## 8. Pitfalls (learned the hard way)

- **Smartlead/HeyReach connect is DASHBOARD-only.** `integration_create` 422s for them (it only
  accepts bing_webmaster and dataforseo). Do not burn cycles trying to connect from here — send
  the user to Marketing → Outbound → settings, then verify with `integration_list` +
  `outbound_list_campaigns`.
- **Keys live in `automations/.env`** (gitignored), never in code, commits, or worker files. The
  dashboard connection and the `.env` keys are SEPARATE — both are required.
- **Never re-process seen replies.** Every worker uses `loadSeen`/`saveSeen`. A triage loop
  without idempotency double-messages prospects — instant reputation damage.
- **`outbound_create_campaign` is SmartLead-only today** — other providers 412
  unsupported_provider. HeyReach campaigns are created provider-side and mirrored in.
- **`email_webhook_create` is for Hiveku's own send events**, not provider replies. Provider
  replies come via `workflow_provision_webhook` + the provider's webhook settings, or polling.
- **Respect provider rate limits** (Smartlead, HeyReach, and LinkedIn enforce strict daily caps —
  per `.claude/AUTOMATION.md`). Never blast; batch and space API calls too.
- **LinkedIn automation is a ToS risk.** Human-like volumes only; a restricted client seat is
  worse than a slow campaign.
- **Provider is send-truth, Hiveku is record-truth.** Drive sends from Smartlead/HeyReach;
  persist replies, statuses, and outcomes into Hiveku. If the mirrors drift, reconcile FROM the
  provider INTO Hiveku, never the reverse.
- **Exact REST endpoints beyond what is documented here: (verify against current provider docs)**
  — bases are `server.smartlead.ai/api/v1` (query-param `api_key`) and `api.heyreach.io`
  (`X-API-KEY` header). Do not invent paths; check the live docs, then code the worker.

## Operating rhythm at a glance

- **Hourly (workdays, automated):** reply-triage worker — pull replies, classify, mirror to
  Hiveku, queue drafts for approval, enforce suppression. Zero Claude cost except judgment calls.
- **Daily (human-in-the-loop):** approve/send queued reply drafts, book meetings for positives,
  clear the unsubscribe/bounce queue, glance at bounce + complaint monitors.
- **Weekly:** funnel review, kill/scale decisions, promote A/B winners, list-runway check,
  deliverability health pass, next segment/list build if runway < 3 weeks.
- **Monthly:** client report to `reports/outbound-YYYY-MM.md`, targets vs. actuals, learnings to
  `memory_create`, infrastructure review (domains/mailboxes aging in, warmup pool health).

Definition of done for any outbound task: provider state and Hiveku mirror agree, the CRM shows
the touch, suppression is honored, nothing was sent without approval, and the seen-state is saved.
