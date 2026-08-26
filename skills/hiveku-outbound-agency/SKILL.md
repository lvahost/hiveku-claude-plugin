---
name: hiveku-outbound-agency
description: Full outbound/BDR agency methodology for a Hiveku account. Use for cold email (Smartlead), LinkedIn outreach (HeyReach), outbound campaigns, list building and prospecting, lead enrollment, deliverability and warmup, reply handling and triage, meeting booking from outbound, and outbound reporting.
---

# Hiveku Outbound Agency — run outbound like a retainer agency

You are operating a full outbound/BDR program: cold email through Smartlead, Hiveku as the system
of record AND the reply loop (18 outbound tools — inbox, drafts, health, objections, assets,
learnings), LinkedIn through HeyReach as an out-of-band channel with no Hiveku integration, and
the local automations worker as an optional 24/7 backstop. The bar is an agency charging thousands
per month: tight ICP, disciplined deliverability, same-day reply handling, honest metrics.

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
4. **Idempotency everywhere.** Prefer the server's own: `outbound_save_reply_draft` allows one
   pending draft per thread, `outbound_push_lead_to_crm` is safe to re-run, `outbound_log_objection`
   dedupes on text within a type, `outbound_record_sequence_learning` upserts per (campaign, step,
   variant). Only for provider REST calls that Hiveku does not cover do you hand-roll it, exactly
   like the local worker does (`loadSeen` / `saveSeen` in `automations/lib.mjs`, state in
   `automations/state/<id>.json`). Never double-enroll a lead, never re-triage a reply, never
   double-draft.
5. **Confirm the account** (`get_account_info`) before writing — the MCP key is pinned to one
   Hiveku account.

## 2. Program architecture — who owns what

- **Hiveku = system of record.** If it is not mirrored into Hiveku, it did not happen — reporting,
  memory, the BDR inbox, and the dashboard all read from here. The full outbound surface is 18
  tools on six rails:
  - **Campaigns + leads (5):** `outbound_list_campaigns`, `outbound_create_campaign`,
    `outbound_list_leads`, `outbound_create_lead`, `outbound_update_lead`.
  - **Inbox + reply drafts (3):** `outbound_list_inbox` (the pre-classified BDR reply queue),
    `outbound_save_reply_draft` (saves a PENDING draft, never sends),
    `outbound_list_reply_drafts` (read the approval queue back).
  - **Health (1):** `outbound_health_status` — readiness score, blockers, warnings, reply SLA,
    per-mailbox health. First call of every health check and every pre-launch gate.
  - **CRM handoff (1):** `outbound_push_lead_to_crm({ lead_id })` — the canonical handoff. It
    carries profile, company, custom fields, tags, and the full email history in one idempotent
    call. Use `crm_create_activity` only for notes the push does not carry (e.g. your drafted
    response).
  - **Objection library (3):** `outbound_list_objections`, `outbound_log_objection`,
    `outbound_update_objection` — account-level patterns with counter-responses and win rates.
  - **Sales assets (3):** `outbound_list_sales_assets`, `outbound_add_sales_asset`,
    `outbound_update_sales_asset` — calendar link, pricing sheet, case studies for reply drafting.
  - **Sequence learnings (2):** `outbound_record_sequence_learning`,
    `outbound_list_sequence_learnings` — per (campaign, step, variant) A/B results.
- **Smartlead = the email sending engine.** Mailboxes, warmup, sequences, sending schedules, and
  suppression live there. REST: `https://server.smartlead.ai/api/v1/...?api_key=...` — campaigns,
  leads, sequences, email-accounts, analytics, webhooks (fire on reply/bounce/unsubscribe).
  Example documented in the worker template: `GET /api/v1/campaigns/{id}/leads?api_key=...&reply_received=true`.
  Any endpoint beyond these: (verify against current provider docs) — do not invent paths.
- **HeyReach = an OUT-OF-BAND LinkedIn engine, not a Hiveku integration.** Hiveku's cold-email
  integration is SmartLead-ONLY today: the dashboard connect form hardcodes
  `provider: 'smartlead'`, and `cold_email_integrations` is unique on (account, provider) with
  SmartLead the only writer. Every outbound write tool 412s `unsupported_provider` on anything
  else. So: run HeyReach entirely through its own REST (`https://api.heyreach.io/...`,
  `X-API-KEY` header; endpoint shapes: verify against current provider docs) plus the local
  worker. **LinkedIn touches CANNOT be mirrored as outbound leads** — `outbound_create_lead`
  rejects any non-SmartLead campaign. Mirror them into the CRM instead:
  `crm_contact_upsert_by_email` + `crm_create_activity`. (HeyReach's own two-way sync with
  Smartlead is a feature of those two third-party products; it does not touch Hiveku.)
- **Local automations worker = the free 24/7 loop.** Scaffolded by "Hiveku: Scaffold Local
  Automations" into `automations/` (documented in `.claude/AUTOMATION.md`). One launchd/cron
  entry runs `dispatcher.mjs` every minute; CRUD jobs via
  `node automations/manage.mjs list|create|update|enable|disable|delete|run|install|status`.
  Workers use `lib.mjs` helpers: `hiveku(tool, args)` (free MCP calls), `http(url, opts)`
  (Smartlead/HeyReach REST), `claudeP(prompt)` (judgment only), `loadSeen/saveSeen` (idempotency).
  It is the BACKSTOP for out-of-hours coverage and for HeyReach, not the primary reply loop — see
  section 6.
- **Scope honesty:** campaign pause/resume, mailbox settings, warmup, and sending schedules have
  NO MCP tool — those are dashboard or provider-side. Two more gaps worth knowing: there is no
  tool for inbox THREAD DETAIL (the route exists but is unmapped, so `latest_message_preview` is
  all you get per thread), and none for outbound PIPELINE-STAGE config (board columns and their
  CRM rules are dashboard-only).

### First-run wiring (once per account)
1. Check state: `integration_list` + `outbound_list_campaigns` (each campaign row carries the
   `integration_id` of its provider connection).
2. Connect **SmartLead** in the **Hiveku dashboard** (Marketing → Outbound → settings). The form
   takes a SmartLead API key; the provider is implicit and not selectable — there is no HeyReach
   option, and there will not be one until the integration is built. Connect is dashboard-ONLY:
   `integration_create` accepts only bing_webmaster and dataforseo; everything else 422s with a
   dashboard URL. `integration_test({ integration_id })` live-checks credentials for integrations
   that support it.
3. Put `SMARTLEAD_API_KEY` into `automations/.env` (gitignored) so local workers can poll the
   provider directly — plus `HEYREACH_API_KEY` only if this account actually runs HeyReach
   out-of-band. Keys go in BOTH places: dashboard connect feeds the Hiveku outbound tools; `.env`
   feeds the local workers. Never in code or commits.
4. Seed the account's sales assets so reply drafting has something real to reference:
   `outbound_add_sales_asset({ asset_type, name, url?, content?, use_cases?, persona_tags? })`
   with `asset_type` one of pricing | calendar | case_study | one_pager | demo | other. The
   calendar link is the minimum — without it every positive reply improvises a booking step.
5. Reply events: `workflow_provision_webhook({ name })` → `{ webhook_url, trigger_id }`; paste
   `webhook_url` into the provider's own webhook settings to push replies into a Hiveku workflow.
   Otherwise rely on Hiveku's own inbox sync plus the reply-triage worker. (`email_webhook_create`
   covers Hiveku's OWN email send events, NOT provider replies — never use it for this.)

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
   - Local/geographic prospecting where the ICP is location-based (local services, retail,
     multi-location): `seo_research({ action: "gbp-locations", query, location_name })` finds
     businesses by query, and `seo_research({ action: "gbp-info", domain })` (or `target` /
     `place_id`) returns one business's snapshot. Both spend DataForSEO credits against the
     account's monthly SEO research cap with no confirm step of their own, so confirm the spend
     with the user before calling.
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
   first_name, company_name, linkedin_url, ... })` (required: `campaign_id`, `email`) and
   `crm_contact_upsert_by_email`. Know the real behavior before loading a list:
   - **One call = one lead.** There is no bulk path. A 500-lead list is 500 calls — space them and
     expect it to take a while, or load the list in SmartLead directly and let the sync mirror it.
   - **409 `upstream_rejected` = SKIP, not retry.** "SmartLead rejected the lead (possibly a
     duplicate or on the global block list)" — the prospect is already enrolled or suppressed.
     Retrying will never succeed. Count it and move on.
   - **`status: 'pending_sync'` with a `pending-<timestamp>` external_id is the NORMAL result.**
     SmartLead's add-lead response has no lead id, so Hiveku inserts a placeholder that the next
     sync reconciles. A wall of `pending_sync` rows after a bulk load is a healthy load, not a
     broken one. Do not report it as a failure.
   - A `pending-*` lead cannot be patched upstream: `outbound_update_lead` on one returns 200 with
     `warning: "Lead is still pending SmartLead sync — only local fields updated."`
   - Other refusals: 404 (campaign not found), 412 `integration_inactive`, 412
     `unsupported_provider` (non-SmartLead campaign), 412 `integration_missing_key`, 502
     `upstream_failed`.

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
   (required: `name`, `integration_id`; `integration_id` must be a UUID). Read what it actually
   does before you promise a client a built campaign:
   - It creates the SmartLead campaign with the **name ONLY**. `sequences` are mirrored **LOCALLY
     ONLY** as JSON on the Hiveku row. The upstream campaign comes back EMPTY — zero email steps.
   - So a 201 plus a campaign row carrying your approved 4-step sequence does NOT mean the
     sequence exists in SmartLead. If someone activates that campaign it sends nothing, or the
     loaded list burns against a campaign with no steps.
   - **The email steps must be authored in the SmartLead dashboard (or via SmartLead REST) before
     activation.** Say this out loud to the user rather than reporting the campaign as built.
   - **Verify before any go-live sign-off:** re-read the campaign in SmartLead and confirm the
     steps exist upstream. A Hiveku-side read cannot prove it — the local JSON is the copy you
     passed in, not what the provider holds.
   - Refusals: 404 (integration not found, inactive, or not owned by this account), 412
     `unsupported_provider` (non-SmartLead), 412 `integration_missing_key` (re-connect in Outbound
     settings), 502 `upstream_failed` (SmartLead refused the create).
   - HeyReach campaigns are built in HeyReach and stay there — they cannot be mirrored as Hiveku
     campaigns or leads. Mirror LinkedIn touches into the CRM
     (`crm_contact_upsert_by_email` + `crm_create_activity`) instead.
5. **LinkedIn sequence shape (HeyReach):** connection note (short, no pitch, under ~280 chars) +
   2 follow-ups after acceptance (value message, then soft CTA), 2-3 days apart. LinkedIn is the
   relationship channel — pitch-slapping on acceptance is the fastest way to get reported.
6. **A/B rules:** one variable at a time (subject OR opener OR CTA — never two). Minimum ~100-150
   sends per variant before judging; below that you are reading noise. Winner becomes control;
   next test starts from the control. **Learnings live in the account, not in your head:**
   - Before writing ANY new sequence: `outbound_list_sequence_learnings({ is_winner: 'true' })`
     (optionally `{ campaign_id }`) so past winners seed the next campaign.
   - When a variant reaches decision volume: `outbound_record_sequence_learning({
     external_campaign_id, sequence_number, variant_label?, subject_line?, body_content?,
     stats: { sends, opens, replies, positive_replies, meetings_booked, bounces, unsubscribes },
     learning_notes?, key_elements?, is_winner?, is_loser? })` — required are
     `external_campaign_id` and `sequence_number`. It upserts per (campaign, step, variant), so
     re-recording a step refreshes it rather than duplicating.
   - Two traps: `external_campaign_id` is the **PROVIDER** campaign id — the `external_id` field
     on the row from `outbound_list_campaigns`, NOT the Hiveku UUID. And pass RAW COUNTS only in
     `stats`; every rate is computed server-side, so a rate you pass in is either ignored or wrong.
   - `outbound_list_sequence_learnings({ campaign_id })` also takes the external campaign id.
7. **Copy screening:** when sequences run through Hiveku CRM, run `crm_sequence_spam_check`
   before activation. For Smartlead-side copy, apply the same standard manually: no ALL CAPS, no
   "free/guarantee/act now" clusters, no link shorteners, no tracking-pixel-heavy HTML.
8. **Nothing goes live without the pre-launch gate.** Run `/hiveku:outbound-launch` (section 4c)
   before any campaign is activated. `outbound_health_status` blockers are a hard stop.

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

## 4c. Pre-launch gate (run before EVERY activation)

Activation is where the expensive failures happen — a burned domain, a client spam-filed, a list
loaded against an empty campaign. The full play is `/hiveku:outbound-launch`. The gate:

1. `outbound_health_status` — **refuse to launch on any `blockers[]` entry.** Report
   `readinessScore`, `healthStatus`, and `inboxHealth[]` before anything else.
2. Suppression sweep: `email_suppression_list` + `crm_get_dnc_status` + `crm_search_contacts` for
   existing customers. A DNC'd or current-client address in the list is a stop, not a warning.
3. Confirm the SmartLead campaign actually has email steps upstream (section 4.4 — Hiveku's
   `sequences` JSON does NOT prove this).
4. `outbound_list_leads({ campaign_id })` — verify the loaded list and count `pending_sync` rows
   (normal after a fresh load, see 3.6).
5. **Explicit human approval of the list AND the copy.** Activation itself is dashboard or
   provider-side; you are handing the user a verified go/no-go, not flipping the switch.

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
5. **Hard monitors — `outbound_health_status` FIRST, every time.** One no-argument call returns
   the whole picture: `blockers[]`, `warnings[]`, `readinessScore` (0-100), `healthStatus`
   (healthy | warning | critical), `replyCoverage` (24h reply SLA), per-mailbox `inboxHealth[]`
   (email, status, warmupScore, dailySent, dailyLimit), and `metrics` (activeCampaigns,
   draftCampaigns, totalInboxes, healthyInboxes, warmingInboxes, totalSent, bounceRate, unsubRate,
   pendingReplies, positiveReplies, overdueReplies). Bounce rate, unsub rate, and warmup state
   live on campaign/mailbox counters and CANNOT be reconstructed from lead rows — do not try.
   Know the server's own thresholds so your advice matches the score it reports:
   - Bounce rate > 10% → **blocker** (readiness -30). > 5% → warning (-15). > 2% → warning (-5).
   - Unsubscribe rate > 2% → warning (-10).
   - No connected inboxes → **blocker** (-40). Fewer than 3 → warning (-10). No inbox warming →
     warning (-5). Mailboxes with warmup reputation < 50 or > 90% of daily limit → warning (-10).
   - More than 5 unhandled positive replies → **blocker** ("revenue at risk"). 1-5 → warning.
   - More than 5 replies over 24h old → warning (SLA at risk).
   Agency standards are TIGHTER than the server's blocker line — hold to them regardless of score:
   - Bounce rate > 3% on any campaign → PAUSE the campaign (provider-side), re-verify the
     remaining list, investigate before resuming.
   - Spam complaint rate > 0.1% → PAUSE and rework the copy/targeting. Complaints compound.
     (Complaint rate is NOT in `metrics` — read it from SmartLead's own analytics.)
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

**Hiveku already runs this loop server-side. Use it — do not rebuild it.** `/api/cron/sync-smartlead-inbox`
pulls replies into `cold_email_inbox_threads` and classifies each one, so the queue arrives
pre-triaged. Rebuilding this with a local worker costs an API key on disk, a cron install,
hand-rolled idempotency, and LLM classification calls to reproduce something already free and
already visible to the BDR in the dashboard.

### 6.1 The native loop (default)

1. **Read the queue:** `outbound_list_inbox({ thread_status: 'needs_reply' })`. Filters:
   `thread_status` (needs_reply | replied | archived | snoozed), `sentiment` (positive | negative |
   neutral), `campaign_id`, `page`, `limit`. Work `sentiment: 'positive'` first — those are the
   revenue-at-risk threads the health blocker counts.
   Each thread carries `classification` from the server's CLOSED vocabulary — **interested,
   meeting_booked, not_interested, out_of_office, unsubscribe** — plus `sentiment` and `priority`.
   **Read that classification; do not recompute it.** Your own labels will not match the
   dashboard's and the disagreement is invisible to the BDR.
   **Limit to state plainly:** there is no MCP tool for thread detail, so `latest_message_preview`
   is all you see per thread. For a long or ambiguous thread, say so and send the user to the
   dashboard (or the SmartLead API) rather than drafting off a preview.
2. **Ground the draft before writing it:**
   - `outbound_list_objections({ is_approved: 'true' })` — the tool's own instruction is "Consult
     BEFORE drafting replies." Only `is_approved: 'true'` responses may be reused verbatim;
     approval is a human act via `outbound_update_objection({ objection_id, is_approved: true })`.
   - `outbound_list_sales_assets({ is_active: 'true' })` for the calendar link, pricing sheet, or
     case study the reply should point at. **Pass `is_active: 'true'` every time** — the default
     returns ALL statuses including RETIRED assets, and a dead pricing sheet or an expired
     calendar link in front of a prospect is a real incident.
3. **Draft:** `talk_to_department({ domain: "outbound", message })` with the thread preview, the
   matching approved objection response, and the chosen asset in the message.
4. **Save for approval:** `outbound_save_reply_draft({ thread_id, body_text, subject? })` —
   required `thread_id` and `body_text` (plain text, 3-5 sentences). This does **NOT** send: it
   saves a PENDING draft and a human approves and sends from the inbox Drafts tab. It is
   idempotent — one pending draft per thread; a re-call returns the existing one with
   `action: 'existing_pending'` instead of creating a second. **That replaces loadSeen/saveSeen
   for this job.** Read the queue back with `outbound_list_reply_drafts({ status })` (pending |
   approved | discarded | sent; pending is the default).
5. **Record the objection outcome** once it is known: `outbound_log_objection({ objection_type:
   price | timing | authority | competitor | no-need | trust, objection_text, response_text?,
   response_outcome: overcome | lost | pending, industry?, persona?, source_thread_id?,
   source_campaign_id? })` — required are `objection_type` and `objection_text`; duplicate text
   within the same type increments the seen-count instead of creating a row. For a pattern that
   already exists: `outbound_update_objection({ objection_id, response_outcome,
   increment_overcome: true })` so the win rates stay real.
6. **Log the asset use:** `outbound_update_sales_asset({ asset_id, times_used_increment: true })`
   after referencing one.

### 6.2 Mirroring to lead + CRM

- **CRM handoff is ONE call:** `outbound_push_lead_to_crm({ lead_id })`. It creates or updates the
  contact carrying profile, company, custom fields, tags, and the full SmartLead email history —
  none of which the hand-assembled `crm_contact_upsert_by_email` + `crm_create_activity` path can
  reach. Idempotent: re-pushes append only new emails.
  **Branch on the returned outcome, not on the absence of an exception.** The underlying
  `pushLeadToCrm` RESOLVES `{ outcome: 'failed' }` rather than throwing; the route surfaces that
  as 422 with `data.outcome`. A try/catch around it is dead code for the common failure, and
  ignoring the body means reporting a handoff that never happened.
- Use `crm_create_activity` only for what the push does not carry — chiefly your drafted response.
- **Lead state:** `outbound_update_lead({ lead_id, is_interested, internal_status, internal_notes })`.
  Two traps from the route itself:
  - **Never use `status` to represent a real lifecycle change.** `status` updates the LOCAL mirror
    only; SmartLead's lead lifecycle is driven by replies and bounces and is not safe to overwrite
    from a write tool, so the next sync may contradict you. Agent-side state belongs in
    `internal_status` / `is_interested` / `internal_notes`, which are local by design and survive
    sync (the sync skips an upstream `is_interested: false`, so your flag is not clobbered).
  - **After any name/email/company/phone/linkedin/website edit, READ the response `warning`
    field.** Those fields are pushed to SmartLead best-effort and the call still returns **200**
    on failure, with `warning: "SmartLead update failed: …"` or "Integration cannot accept upstream
    updates — only local fields updated." A 200 does not mean the provider accepted the change;
    surface the warning or the edit is lost on the next reconcile.

### 6.3 Act by classification

- **interested / meeting_booked:** draft and save per 6.1, then book:
  `calendar_free_slots` → propose 2-3 times → `calendar_create_event` on confirmation.
  **Before creating a deal by hand, check the board.** Hiveku's outbound board can create the deal
  for you: `cold_email_pipeline_stages` carry per-stage CRM rules (create contact / company /
  deal) and the stage sweep fires them with two idempotency layers keyed on the lead and stage. A
  manual `crm_create_deal` carries neither key, so on an account with a configured Interested
  stage **every positive reply produces TWO deals** and the pipeline number you later report to
  the client is inflated.
  Default behavior: set `is_interested` / `internal_status` and let the stage rule create the
  deal. Create a deal manually ONLY after the user confirms no rule exists on the matching stage
  (dashboard: Marketing → Outbound → board → Configure; there is no MCP tool for pipeline stages).
  Latency to expect: the Olympus PATCH does not bump `pipeline_signals_at`, so a tool-driven
  interest flip is picked up by the 24h full-rescan lane rather than the immediate event lane —
  the board can lag a day behind your write. Do not "fix" that by creating the deal yourself.
- **Question / objection:** 6.1 steps 2-5. The objection library is what makes this compound
  across sessions — a reply drafted without reading it throws away every prior win.
- **not_interested / not-now:** polite close draft + `crm_reminder_schedule` for the re-touch date
  they implied (default 90 days); remove from active sending (provider-side) so the sequence stops.
- **unsubscribe:** `crm_set_dnc` + `email_suppression_add` + provider suppression, stop all
  sequences for that contact, NO reply draft. Immediate, unconditional.
- **Bounce:** mark the lead (`internal_status`) and let `outbound_health_status` carry the bounce
  rate (section 5) — bounce counters live on the campaign, not on lead rows. On a bounce spike
  against a verified list, pause per the monitor rules.
- **out_of_office:** no draft, no state change. Snooze and re-check.

### 6.4 The local worker (optional backstop)

Use it for out-of-hours coverage and for HeyReach, which has no Hiveku surface at all. It is NOT
the primary loop.
`node automations/manage.mjs create --id reply-triage --cron "17 9-17 * * 1-5" --worker reply-triage`
(then `node automations/manage.mjs install` once, `run --id reply-triage` to test).
When it runs: read `classification` off the thread rather than recomputing it, keep `loadSeen` /
`saveSeen` for anything it pulls from a provider REST endpoint, and route drafts into
`outbound_save_reply_draft` so approval stays in one place instead of scattering across CRM notes.

**Approval gate (all paths):** drafts are PENDING until a human approves and sends from the inbox
Drafts tab. Nothing here sends email. Never describe a saved draft as a sent reply.

## 7. Metrics + weekly cadence

**Benchmarks (cold B2B, healthy deliverability):**
- Email: open 40-60% (where tracked — see 5.6), reply 2-8%, positive replies ~20-30% of replies,
  bounce < 3%, complaints < 0.1%.
- LinkedIn: connection accept 20-40%, reply 5-15% of accepted.
- A campaign under 1% reply after 200+ sends is a kill candidate, not an optimization candidate.

**Weekly review (one working session):**
1. **`outbound_health_status` first.** Blockers and warnings set the agenda; `readinessScore`,
   `replyCoverage`, and `inboxHealth[]` are the health section. Everything below is drill-down.
2. Pull the funnel per campaign: `outbound_list_campaigns` (each row carries sent_count,
   reply_count, positive_reply_count, bounce_count, unsubscribe_count, total_leads) +
   `outbound_list_leads` (filters: status, internal_status, is_interested, has_replied,
   campaign_id) + provider analytics for anything the counters do not cover +
   `crm_report_conversion_funnel` for the downstream picture.
3. Kill/scale rules: kill anything under benchmark after sufficient volume; scale winners by
   adding mailboxes/leads (never by exceeding ramp caps); promote the winning A/B variant and
   start the next test. **Persist the verdict:** `outbound_record_sequence_learning` per
   step/variant with raw counts and `is_winner` / `is_loser` (external campaign id — see 4.6), so
   the next campaign starts from evidence instead of memory.
4. List burn: leads remaining vs. weekly consumption — flag when < 3 weeks of runway so list
   building starts BEFORE the machine starves.
5. Reply hygiene: `outbound_list_reply_drafts({ status: 'pending' })` — drafts sitting unapproved
   are unanswered prospects. Cross-check against `metrics.overdueReplies` from step 1.

**Monthly report (client-facing):** sends, replies, positive replies, bounce and unsubscribe rate
(all from `outbound_health_status` metrics and the `outbound_list_campaigns` counters — NOT from
`email_stats`, which covers Hiveku's own transactional/marketing email and has zero visibility
into cold sending; never sum the two channels), meetings booked, and pipeline created (deal count
+ value from `crm_list_deals` / `crm_report_pipeline_summary`) vs. targets, plus next month's
plan. If a number is not in one of those sources, say where it came from or leave it out — a
fabricated metric in a client report is worse than a gap. Write it as markdown to
`reports/outbound-YYYY-MM.md`, and persist the headline learnings with `memory_create` (domain
outbound) for strategy-level lessons — per-variant copy results belong in
`outbound_record_sequence_learning`, not in memory.

## 8. Pitfalls (learned the hard way)

- **SmartLead is the ONLY Hiveku cold-email provider.** The dashboard connect form hardcodes it;
  there is no HeyReach option and no way to add one from here. Connect is DASHBOARD-only:
  `integration_create` 422s (it only accepts bing_webmaster and dataforseo). Send the user to
  Marketing → Outbound → settings, then verify with `integration_list` + `outbound_list_campaigns`.
- **Keys live in `automations/.env`** (gitignored), never in code, commits, or worker files. The
  dashboard connection and the `.env` keys are SEPARATE — both are required if you run the worker.
- **Never re-process seen replies.** For the native loop, `outbound_save_reply_draft`'s
  one-pending-draft-per-thread rule is the idempotency. For anything the local worker pulls from a
  provider REST endpoint, use `loadSeen`/`saveSeen`. A triage loop without idempotency
  double-messages prospects — instant reputation damage.
- **`outbound_create_campaign` creates an EMPTY SmartLead campaign.** `sequences` are mirrored
  locally only; the email steps must be authored in SmartLead before activation (section 4.4).
  Never report a campaign as built off the 201 alone.
- **`outbound_create_lead` on a HeyReach/LinkedIn campaign is impossible** — the route 412s
  `unsupported_provider`. Mirror LinkedIn touches into the CRM, not into outbound.
- **`outbound_update_lead` returns 200 even when SmartLead refused the edit** — read the `warning`
  field. And `status` never goes upstream; use `internal_status` (section 6.2).
- **`outbound_push_lead_to_crm` fails by RESOLVING, not throwing** — branch on `data.outcome`.
- **A manual `crm_create_deal` on a board with a configured Interested stage creates a DUPLICATE
  deal** and inflates the pipeline figure in the client report (section 6.3).
- **`outbound_list_sales_assets` returns RETIRED assets by default** — always pass
  `is_active: 'true'` before putting a link in front of a prospect.
- **`email_stats` is NOT outbound sending.** It reports Hiveku's own transactional/marketing email
  (the Resend surface). Cold-email volume lives on the campaign counters and in
  `outbound_health_status`. Never label one as the other, never sum them.
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

- **Daily (the loop):** `outbound_health_status`, then `outbound_list_inbox({ thread_status:
  'needs_reply' })` positives first — ground on approved objections + active assets, draft via
  `talk_to_department`, save with `outbound_save_reply_draft`, push positives with
  `outbound_push_lead_to_crm`. The human approves and sends from the inbox Drafts tab, books
  meetings, and clears the unsubscribe/bounce queue.
- **Hourly (optional, automated):** reply-triage worker as the out-of-hours and HeyReach backstop
  (6.4). Zero Claude cost except judgment calls.
- **Per launch:** the section 4c gate / `/hiveku:outbound-launch`. No activation without it.
- **Weekly:** health pass, funnel review, kill/scale decisions, A/B winners recorded with
  `outbound_record_sequence_learning`, pending-draft sweep, list-runway check, next segment/list
  build if runway < 3 weeks.
- **Monthly:** client report to `reports/outbound-YYYY-MM.md`, targets vs. actuals, strategy
  learnings to `memory_create`, infrastructure review (domains/mailboxes aging in, warmup pool
  health from `inboxHealth[]`).

Definition of done for any outbound task: provider state and Hiveku mirror agree, the CRM shows
the touch, suppression is honored, nothing was sent without approval, and the seen-state is saved.
