# Paid Social and Microsoft Ads: Bing, Meta, TikTok, LinkedIn

## What this covers / when to load this

Everything that is not Google Ads: Microsoft Ads (Bing), Meta, TikTok, LinkedIn. Load it for Microsoft geo and conversion-goal work, Bing waste mining and shared negatives, Meta fatigue and placement audits, Meta audiences and Advantage+ posture, TikTok hook diagnosis and pixel verification, LinkedIn ICP validation and ABM, lead-gen retrieval into the CRM, and cross-platform reallocation. SKILL.md is the router; Google work lives in the sibling references. This file carries judgment, chains and traps; read each tool's own description for full parameter lists. SKILL.md section 0 holds throughout: context first, local data before live calls, one confirmation per spend-affecting change, protected campaigns untouchable, nothing bulk-applied or sent silently.

---

## 1. Gates

1. **Context.** `account_context_get({ domain: "ppc" })`, then `memory_list` for what decides everything downstream: which platforms the client wants, ceiling and target CPA/ROAS per platform, approval threshold, protected campaigns, sacred geos, brand-safety position (a regulated client may forbid public comment replies outright). `get_account_info` names the account for the report. No per-platform target in memory means no mandate: ask, `memory_create`, then start.
2. **Local first.** Read `hiveku-data/ppc/campaigns.json`, `ads.json`, `keywords.json`, `search_terms.json`, `metrics_daily.json` and `hiveku-data/STATUS.json` before any live call. A connection in STATUS `failed` means NOT RETRIEVED, never "no spend." `truncated: true` makes `count` a floor. Local rows serve analysis, not the pre-write read of a value you are about to overwrite.
3. **Connection scoping.** `ppc_connection_list` for platform, status, campaign_count; `ppc_connection_get` for one. Every `ppc_bing_*` / `ppc_meta_*` / `ppc_tiktok_*` / `ppc_linkedin_*` call needs a connection_id on THAT platform: a Google id in a Bing tool is a wrong-platform error, not an empty result, and the Google-only family (search terms, quality score, assets, bid modifiers, recommendations) fails here the same way.
4. **Freshness, and the Bing mirror.** `ppc_digest({ days: 7 })` is the one-call cross-platform read; `warnings[]` flags connections stale past 25h. `ppc_sync` before trusting numbers, `ppc_sync_async` for a deep backfill, `ppc_sync` again after writes. Microsoft adds a layer: most `ppc_bing_*` writes check ownership against the LOCAL mirror, so run `ppc_sync`, `ppc_bing_pull_ad_groups`, `ppc_bing_pull_ads` before ad-group or ad-scoped work. The live fallback refuses accounts over 50 campaigns when the mirror is cold, and that refusal reads like a permissions failure if you do not know this.

---

## 2. Framework A: what each platform is for

| Platform | Role | Success metric | Failure it hides |
|---|---|---|---|
| Microsoft | Cheap incremental search; older, higher income, desktop and B2B | CPA at or under Google non-brand CPA | Geo leak, untracked conversions |
| Meta | Demand creation and remarketing at low CPM | Blended CPA plus creative velocity | Fatigue misread as audience exhaustion |
| TikTok | Top-of-funnel attention, video-native, young skew | Hook rate, cost per qualified lead | Good watch metrics, zero downstream conversion |
| LinkedIn | Expensive precise B2B reach against a named ICP | Cost per qualified lead by title and company size | Spend against the wrong seniority |

Never import a Google CPA target onto Meta or TikTok without restating what a conversion means there: three platforms, three events, three attribution windows. Report per platform; blend spend only, after explicit currency normalisation. LinkedIn CPCs run several times Meta's, so a campaign that looks catastrophic on CPL may be the only one reaching the buying committee: judge it on pipeline, which makes the offline loop in Play 11 mandatory.

## 3. Framework B: Microsoft is not "Google with less volume"

A Bing audit is mostly the hunt for four import defects. (1) **Location intent** defaults to `in_or_searching`, so ads serve both to people in the area and to anyone anywhere searching about it: a pure leak on a local-service client and usually the highest-value fix in the account. (2) **No location targeting at all**, because a fresh shell serves everywhere the account allows; `ppc_bing_criterions_list` returns `has_location_targeting: false` for exactly this. (3) **Goals that record nothing**, because Bing tracking is a UET tag plus goals hung off it and an uninstalled tag makes every goal report zero, blocking smart bidding and making the channel look worthless. (4) **Negative drift**, because imported negatives are a snapshot from import day and Microsoft's matching plus its wider search-partner inventory put waste elsewhere.

## 4. Framework C: the paid-social diagnosis ladder

Top-down, stop at the first failing rung. This is what prevents rewriting creative when the pixel is dead.

1. **Delivery.** Rejections, exhausted budget, a paused parent. Meta and TikTok serve only when the whole chain is active; on LinkedIn a DRAFT anywhere means nothing serves.
2. **Measurement.** Is the pixel or rule firing, and is the event the one the client values? Broken measurement means pause, not optimise.
3. **Audience.** `ppc_linkedin_demographics_report`, `ppc_meta_insights_breakdown`, `ppc_tiktok_audiences` operation `insights`.
4. **Creative.** Only now. Frequency up with CTR down is fatigue; low hook rate is a first-two-seconds problem; low CTR on fresh creative is message-market fit.
5. **Offer and landing page.** Clicks without conversions is downstream of the ad: a PM task for the web team, not an ads change.

## 5. Framework D: launch ceilings and confirm gates

What a tool may and may not launch decides what "done" means.

- **Microsoft.** `ppc_bing_push_campaign` creates a Search shell PAUSED. Live requires an explicit `ppc_platform_enable_resource`.
- **Meta.** Every create is forced PAUSED at the wire; no status parameter exists. An ad serves only if its ad set and campaign are active too.
- **TikTok.** Status and budget writes route through the cross-platform tools; budgets exist at campaign or ad group level.
- **LinkedIn.** Groups, pushed campaigns and creatives are all created DRAFT, and **no tool can activate a LinkedIn draft**: `ppc_linkedin_campaign_update` and `ppc_linkedin_creatives` set-status both refuse DRAFT to ACTIVE by design. A human launches it in Campaign Manager, so a LinkedIn build reported as "live" is a false claim.

Tools that preview first and execute only on a repeat with `confirm: true`: `ppc_meta_ad_set_audiences_update`, `ppc_meta_archive`, archive on `ppc_linkedin_campaign_update` and `ppc_linkedin_campaign_group_update`, `ppc_linkedin_creatives` (enable and archive), `ppc_linkedin_audience_segments`, `ppc_linkedin_abm_segment`, `ppc_linkedin_conversions` event send. Show the operator the preview, get a human yes, then confirm. On the conversion send read `event_count` and `total_value_by_currency` into the request: uploaded conversions train LinkedIn bidding and cannot be recalled.

Several write paths are UNVALIDATED-LIVE: the whole Meta write family and the LinkedIn wave-2 lanes (targeting, leadgen, conversions, audience segments, ABM, creative create, boost, media upload). On first use in an account do ONE entity, verify it, then proceed. Never run an unvalidated write across a batch.

---

## 6. Play: Microsoft onboarding audit

First session on a Microsoft connection, then quarterly.

1. `ppc_connection_list` for the microsoft_ads connection_id and status.
2. `ppc_sync`, `ppc_bing_pull_ad_groups`, `ppc_bing_pull_ads`: hydrates the mirror every later write depends on.
3. `ppc_campaign_list` / `ppc_campaign_get` for structure (cached, cross-platform).
4. `ppc_bing_criterions_list` per campaign: `has_location_targeting`, location intent, schedules, device and demographic adjustments, audience criterions. `false` or `in_or_searching` on a local business goes to Play 8.
5. `ppc_bing_conversion_tracking_status`: `ready_for_conversion_bidding` plus per-tag install state. Anything but ready blocks Play 7 and every conversion-based bidding strategy.
6. `ppc_bing_keyword_performance` with `ad_group_id` omitted sweeps all synced ad groups. The ONLY source of Bing keyword ids (keywords are not mirrored locally). Read editorial status: a disapproved keyword is a silent zero.
7. `ppc_bing_ad_extension_list` and `ppc_bing_shared_negative_list_list` for coverage gaps.
8. Baseline into `pm_tasks_create`; connection ids, currency, targets, protected campaigns into `memory_create`.

Drives a defect list ranked by dollars: geo leak, dead tracking, waste, extensions, bids.

## 7. Play: Bing conversion tracking rescue (unlocks smart bidding)

Trigger: `ready_for_conversion_bidding` false, or goals at zero while clicks are healthy.

1. `ppc_bing_uet_tag_list`. A tag not `recording` means the snippet is missing or broken on the site: the number one reason a Bing account reports zero conversions.
2. No tag: `ppc_bing_uet_tag_create`. Spends nothing, serves nothing, returns a `tracking_script` that must be installed site-wide before anything records. That install is a web-team job: `pm_tasks_create` with the snippet and target pages. Creating goals on an uninstalled tag and declaring victory is the classic false close.
3. `ppc_bing_conversion_goal_list` for what exists, including `exclude_from_bidding` and revenue settings.
4. `ppc_bing_conversion_goal_create` against the tag id. The judgment, not the schema: pick the `goal_category` the client values rather than the easiest to fire; set `revenue_type: "fixed"` with `revenue_value` wherever an average deal value exists, since that turns Bing bidding from lead-counting into value-seeking; `count_type: "unique"` on lead-gen so one person submitting twice counts once; `exclude_from_bidding: true` on goals reported but not optimised toward.
5. Goals are created ACTIVE. They never serve or spend, but they DO change what smart bidding optimises toward, so this still needs client confirmation.
6. Re-check `ppc_bing_conversion_tracking_status` once volume accrues. Only then may a campaign move to a conversion-based strategy via `ppc_platform_bidding_strategy_update`, which refuses one without an eligible goal. Its `target_roas` is a RATIO: 2.5 means 250 percent.

## 8. Play: Bing geo leak (the signature Microsoft money bug)

1. `ppc_bing_criterions_list`: confirm the leak before fixing it.
2. `ppc_bing_location_search` resolves place names or postal codes to Microsoft location ids.
3. Propose in one message: current intent, proposed intent, the areas, expected effect (impressions and clicks fall, CPA should fall further). Get the yes.
4. `ppc_bing_location_criterion_add`, max 100 ids, exactly one of campaign_id or ad_group_id; `bid_adjustment_percent` is not allowed with `exclude: true`.
5. Service radius: `ppc_bing_radius_criterion_add` around a lat/lon point.
6. `ppc_bing_location_intent_set` to `people_in`. This is the half that stops the leak; adding locations without setting intent leaves it open.
7. Undo: `ppc_bing_criterion_delete`, max 100 ids. Record criterion ids in the PM comment before you need them.

Fix immediately on local-service accounts. On national ecommerce `in_or_searching` is often correct: check the shipping footprint first.

## 9. Play: Bing waste mining and shared negatives

No Bing search-terms report exists in this set and the Google one refuses a Microsoft connection. Mine from `ppc_bing_keyword_performance`, `hiveku-data/ppc/search_terms.json` where the export covers this connection, and `ppc_metrics`. If neither carries query-level data, say so and read the query report in the Microsoft UI rather than inventing a number.

1. Classify: converters at acceptable CPA; bleeders (spend at or above 1x target CPA, zero conversions); irrelevant (jobs, free, DIY, competitor brand the client may not bid on).
2. Account-wide themes belong on a shared list: `ppc_bing_shared_negative_list_list` first, reuse rather than create a fourth.
3. `ppc_bing_shared_negative_list_create`. Seeded plain strings default to PHRASE; pass `{ text, match_type }` when you mean otherwise. Max 200. A fresh list blocks nothing until attached.
4. `ppc_bing_shared_negative_list_associate` per campaign: the step that bites.
5. `ppc_bing_shared_negative_list_items_add` makes every already-associated campaign block those terms IMMEDIATELY, so confirm the batch and name the campaigns it hits.
6. One-off queries scoped to one campaign or ad group: `ppc_platform_negative_keyword_add`, `match_type` explicit.

Do not seed a Bing list with broad negatives copied from Google. Microsoft matches differently and a broad negative on a brand-adjacent term can silence a campaign. Phrase for recurring patterns, exact for one-offs.

## 10. Play: Bing coverage, schedule, device, audience

- **Extensions.** `ppc_bing_sitelink_extension_create` and `ppc_bing_callout_extension_create` create NOT serving; `ppc_bing_ad_extension_associate` makes them show; verify with `ppc_bing_ad_extension_list`. Low-double-digit CTR lift at no extra CPC: the cheapest win in a thin Bing account.
- **Dayparting.** `ppc_bing_ad_schedule_add` restricts serving to the listed windows and **unlisted hours stop serving entirely**. A spend-shape change; propose only with hour-of-day evidence.
- **Device.** `ppc_bing_device_criterion_set` requires the adjustment and `-100` removes the device class outright. Cap first moves at 20 to 30 percent, only on segments with 30+ clicks or 1x target CPA in cost.
- **Demographics.** `ppc_bing_demographic_criterion_add` has no exclude flag: Microsoft expresses exclusion as `-100`. Never exclude the `unknown` bucket, usually a large share of impressions.
- **Audiences.** `ppc_bing_audience_list` reads what the account can target plus the audience_type the attach lane needs; creation and upload are deliberately not exposed on Microsoft for PII reasons, so a new remarketing list is a UI task. `ppc_bing_audience_criterion_add` attaches one, but whether that RESTRICTS reach depends on the entity's target-and-bid mode, which no tool here reads or flips: check it in the Microsoft UI before assuming an attachment is observation-only. `ppc_bing_audience_criterion_remove` detaches and refuses non-audience ids (geo, schedule, device, demographic go through `ppc_bing_criterion_delete`). Removing an exclusion WIDENS reach: a spend change.
- **New structure.** `ppc_bing_push_campaign`, then `ppc_platform_ad_group_create`, `ppc_platform_keyword_add`, `ppc_platform_responsive_search_ad_create` (Bing needs 3+ headlines, 2+ descriptions), then geo per Play 8, then `ppc_platform_enable_resource` last, with confirmation.

## 11. Play: Meta weekly read

1. `ppc_meta_insights_breakdown`, `breakdowns: ["publisher_platform"]`, campaign level, 30 days. Max 3 breakdowns. Audience Network taking real spend with no conversions is the classic silent leak.
2. `["age","gender"]` to check spend reaches the avatar `account_context_get` gave you.
3. `["placement"]` at `level: "ad"` plus `ppc_meta_creative_list` to join performance to the creative object.
4. Fatigue: frequency climbing while CTR falls and CPM rises. Rebrief, do not rebid; the write that closes the loop is new creative, not a budget cut.
5. `ppc_meta_advantage_status` on top spenders: manual buy or v25 unified Advantage+? Diagnosing an Advantage+ campaign as if its audience were hand-picked wastes a week.
6. `ppc_meta_leadgen` (forms, then leads with `since_unix`) to pull captured leads into the CRM the same session.
7. Disapprovals: no Meta disapproval read in this set. Check Ads Manager, or the lane in `ads-assets-quality.md` if the account exposes one. A rejected ad spends nothing and silently starves its ad set.

## 12. Play: Meta build (creative, ad set, ad)

Everything is inert until the last step.

1. Angles and copy via `talk_to_department({ domain: "ppc", message })` so output is brand-hydrated, then persist here.
2. `ppc_meta_pages_pixels` for the page_id every creative needs and the pixel_id a conversion-optimised ad set needs in `promoted_object`.
3. `ppc_meta_media_upload` from an https URL or s3:// key. Image cap 30MB, video 100MB with no chunked upload, so an oversized video is refused rather than truncated.
4. `ppc_meta_adcreative_create` in link, video or carousel format. A creative alone spends nothing.
5. `ppc_meta_ad_set_create`. `targeting` MUST include `geo_locations`; `promoted_object` is required for conversion goals; daily and lifetime budget cannot be swapped after creation. Size first with `ppc_meta_targeting` delivery-estimate; get interest, behaviour and job-title ids from its search or browse operations.
6. `ppc_meta_ad_create`, then review, confirm, and `ppc_platform_enable_resource` at each level.
7. Existing campaigns: `ppc_meta_campaign_update` covers only name, stop time, special ad categories, bid strategy. Status stays on the platform pause and enable tools; budgets stay on `ppc_platform_budget_update` (CBO at campaign level, ABO with `budget_level: "ad_set"`; a CBO refusal means the budget lives on the ad sets).
8. `ppc_meta_ad_set_update` carries the worst trap on the platform: **targeting REPLACES the whole spec.** No partial merge, anything omitted is dropped, `geo_locations` stays mandatory. Read the current spec, edit, send back whole, expect a learning reset.
9. `ppc_meta_archive` is irreversible here; to stop delivery temporarily use `ppc_platform_pause_resource`.
10. `ppc_meta_campaign_push` pushes a LOCAL draft row (a UUID from the dashboard or the marketing department agent, not a Meta id), always PAUSED. `ppc_meta_advantage_create` builds both halves of an Advantage+ buy, also PAUSED, with targeting beyond geo and audiences left to automation.

## 13. Play: audiences and first-party data

**Pre-hash SHA256 yourself, never send raw PII, never upload a list whose consent basis the client has not confirmed.**

- **Meta.** `ppc_meta_audiences_list` reads what exists, which audiences sit on which ad sets, and one ad set's include and exclude lists, which you MUST read before editing it. `ppc_meta_audience_create` builds rule-based (website or engagement) and lookalike audiences; seed lookalikes from customers, not all site visitors. `ppc_meta_custom_audience_upload` needs an audience that already exists; `_SHA256` schema fields need pre-hashed values while plain ones (city, state, zip) do not, and consent flags go GRANTED only with documented consent. `ppc_meta_ad_set_audiences_update` edits live lists: `add` merges, `replace` makes what you pass the WHOLE list and silently drops the rest.
- **TikTok.** `ppc_tiktok_audiences` manages; `ppc_tiktok_custom_audience_upload` sends pre-hashed emails or E.164 phones to an audience that already exists and accepts user-list uploads (not Engagement or Lookalike types).
- **LinkedIn.** `ppc_linkedin_matched_audience_upload` needs an existing DMP segment of type USER created in Campaign Manager; matching takes 24 to 48 hours. Campaign-side attachment is `ppc_linkedin_audience_segments`, same add-versus-replace semantics, confirm-gated.
- **ABM.** `ppc_linkedin_abm_segment` creates a COMPANY segment and adds companies keyed on organization URN (strongest match), name, domain, website or page URL. Company data is business data and is NOT hashed; person-level identifiers are refused by policy. One call carries roughly 1,500 to 2,000 companies within the params cap even though a segment holds far more, so chunk; re-invoking is safe and unaccounted rows are surfaced. Verify segment size afterwards rather than assuming a clean match.

Suppression is the most under-used first-party move: upload existing customers and EXCLUDE them from prospecting everywhere. Usually 10 to 20 percent efficiency for an hour of work.

## 14. Play: TikTok creative triage

1. `ppc_tiktok_creative_report`, spend descending. The video metrics are the point: `video_plays`, `video_watched_2s`, `video_watched_6s`, `avg_video_plays_per_user`.
2. Hook rate = `video_watched_2s` / `video_plays`; hold rate = `video_watched_6s` / `video_watched_2s`. Weak hook is a first-two-seconds problem, good hook with weak hold is a script problem, good hold with no conversions is offer or landing page.
3. `ppc_tiktok_videos_list` maps ads back to source assets, so you see which raw videos carry multiple winners. Rebrief around those instead of duplicating the ad.
4. `ppc_tiktok_creative` supports the build (identities, AI text ideas, previews, asset info); media upload is not available here.
5. Kill and scale are writes: `ppc_platform_pause_resource` and `ppc_platform_budget_update`, each separately confirmed.
6. Testing: `ppc_tiktok_split_tests` power-estimate, then create with fixed start and end, then result. Do not read a result before the planned end.
7. Large or multi-dimension pulls go async through `ppc_tiktok_reports`: task-create, poll task-check until SUCCEED, task-download.

## 15. Play: TikTok measurement, leads, safety

- `ppc_tiktok_pixels` event-stats (max 10 pixels, 30-day window). A pixel with no recent events is TikTok's dead UET tag: stop optimising and fix it.
- `ppc_tiktok_conversions` defines custom conversions over pixel or app event sources and creates CRM event sets for offline revenue.
- `ppc_tiktok_leads` download-leads creates an async export polled by task id. Route leads into the CRM the same session; a lead sitting in an export is not a lead.
- `ppc_tiktok_brand_safety` diagnosis-get whenever delivery stalls: it surfaces delivery and rejection issues no metric shows. Inventory and exclusion changes affect reach: confirmed changes.
- `ppc_tiktok_comments` and `ppc_tiktok_mentions` cover moderation and listening; every mentions operation needs a Business Center business_id. Public replies: draft, show the client, post only on approval.
- `ppc_tiktok_search_ads` manages Search Ads negatives at advertiser, campaign or ad group scope.

## 16. Play: LinkedIn ICP validation, build, pipeline loop

1. **Validate before optimising.** `ppc_linkedin_demographics_report` by job title, then seniority, company size, industry, against the ICP from `account_context_get`. Spend on the wrong seniority is a targeting fix, never a creative fix, and this is the only honest way to see it.
2. **Research.** `ppc_linkedin_targeting` lists facets, searches within one facet, and forecasts audience size before you commit budget.
3. **Build.** `ppc_linkedin_campaign_groups_list` first: groups are NOT covered by the standard sync, so this is how group ids are discovered. New objectives get their own container via `ppc_linkedin_campaign_group_create`, always DRAFT, budgets guardrailed and hard-capped at 100,000. `ppc_linkedin_campaign_push` pushes a LOCAL draft row into a group; LinkedIn hard-requires a budget AND at least one `urn:li:geo:*` facet at create time, and missing pieces come back as a named list rather than guessed values.
4. **Creative.** `ppc_linkedin_media_image_upload`, then `ppc_linkedin_creative_create`. That lane covers single-image Sponsored Content with a click-through link ONLY: not video, carousel, document, text, spotlight, message ads or lead-gen-form creatives. Do not tell the client otherwise. The post is direct sponsored content (a dark post) and never hits the organic feed. `ppc_linkedin_boost_post` wraps an existing organic post as a DRAFT creative: the cheapest way to test a message before commissioning creative. `ppc_linkedin_creatives` runs the ad layer and can enrich its list with previews and per-creative stats; LinkedIn creatives are unnamed, so `name` is always null.
5. **Handoff.** Everything above is DRAFT and no tool can activate it. End by naming which drafts exist, in which group, and that a human must launch them in Campaign Manager. Log it in the PM task.
6. **Close the loop.** `ppc_linkedin_conversions` lists rules, creates them, and sends CAPI or offline events. Match the click and view windows to the sales cycle: a 90-day post-click window on a long B2B cycle is the difference between LinkedIn looking dead and looking profitable. Push real revenue back (pre-hashed, max 500 events per call), preview, read totals to the operator, confirm, send. A partial response is NOT success: failed events must be resent.
7. `ppc_linkedin_leadgen` retrieves forms and responses for CRM ingestion.
8. `ppc_linkedin_campaign_update` covers name and run dates; `ppc_linkedin_campaign_group_update` covers those plus group budgets, which live ONLY there. Archive on either is irreversible and previews first.

## 17. Play: cross-platform reallocation

1. `ppc_digest({ days: 30 })`, then `ppc_platform_period_comparison` per connection. Microsoft's reporting API is async-only, so that response may tell you to diff cached `ppc_metrics` client-side: do that rather than reporting a gap.
2. Normalise before comparing: currency, conversion definition, attribution window, per platform. Write the assumptions into the report; an unstated assumption is how a reallocation argument becomes a lie.
3. Rank by marginal efficiency, not average CPA. The question is what the NEXT dollar buys, which is why a Bing campaign at 60 percent impression share and target CPA beats a saturated Meta campaign at the same CPA.
4. Propose moves netting to zero against the client ceiling, cap any single move at roughly 25 percent of that connection's monthly target, apply one at a time with `ppc_platform_budget_update`, each separately confirmed. Never move budget out of a protected or brand campaign.
5. `ppc_anomaly_check` for the daily watch where supported, and `ppc_sync` after the write batch.

---

## 18. Thresholds and benchmarks

Defaults only; account memory overrides every line.

- **Bing CTR:** 2 to 5 percent non-brand is healthy (structurally below Google). Under 1.5 percent is relevance or extensions, not bids.
- **Bing volume:** typically 5 to 15 percent of a comparable Google account's search volume at 20 to 40 percent lower CPC. Bing spend above roughly 25 percent of Google spend on the same keyword set means suspect a geo or match-type leak before celebrating.
- **Bing conversion gate:** no conversion-based strategy until `ready_for_conversion_bidding` is true AND the goal has recorded for a full 14 days.
- **Meta frequency:** above 3.0 in a 7-day window on prospecting is fatigue; above 2.0 with falling CTR is the same thing earlier. Remarketing tolerates 5 to 7.
- **Meta creative velocity:** 3 to 5 new creatives per active ad set per month. No new creative in 60 days means decline regardless of bidding.
- **Meta learning:** roughly 50 optimisation events per ad set per week to exit learning. An ad set that cannot reach that should be consolidated, not micro-optimised.
- **Meta placement cut:** over 15 percent of ad set spend with zero conversions across 30 days is an exclusion candidate, with confirmation.
- **TikTok hook rate:** under 20 percent is weak, 30 percent or better is strong. Hold rate under 40 percent means the script loses people. Creative lifespan 7 to 14 days: plan refreshes on that clock, not on CPA.
- **LinkedIn:** roughly 5 to 15 USD CPC and 50 to 200 USD CPL in most B2B verticals; judging it against a Meta CPL is a category error. Audience size 50,000 to 500,000 members is the workable band.
- **Test minimums:** roughly 100 clicks AND 10 conversions per variant, or two full weeks, whichever is later. Never call a paid-social test in week one.
- **Waste cut, any platform:** spend at or above 1x target CPA with zero conversions cuts; 0.5x to 1x is a one-week watchlist; under roughly 10 percent of target CPA is noise.
- **Data gap:** under 10 conversions in the window makes a number directional only. Say so instead of pretending to precision.

## 19. Diagnosis

**Zero conversions.** Tracking before bidding, always. Bing: `ppc_bing_uet_tag_list` for a non-recording tag, then `ppc_bing_conversion_goal_list` for a wrong url expression or an `exclude_from_bidding` flag nobody remembers setting. TikTok: `ppc_tiktok_pixels` event-stats. LinkedIn: `ppc_linkedin_conversions` rules list, checking attribution windows against the sales cycle. Meta: confirm the pixel via `ppc_meta_pages_pixels` and that the ad set carries a `promoted_object`. Only after tracking clears do you look at the ads.

**Ownership or permission error on Bing.** Almost always a cold mirror: `ppc_sync`, `ppc_bing_pull_ad_groups`, `ppc_bing_pull_ads`, retry. The live fallback refuses accounts over 50 campaigns, so it presents as an access failure on exactly the large accounts where it matters most.

**Impressions collapsed overnight.** In order: a schedule that was added, an audience attachment that narrowed reach, a device adjustment of -100, a demographic adjustment of -100, locations added without the intended areas, then rejections. `ppc_bing_criterions_list` shows the first four in one call. On Meta the usual culprit is an ad set targeting edit that dropped fields it did not resend.

**Numbers do not match the platform UI.** Three legitimate causes before calling it a bug: attribution window, currency, cache staleness. Check `last_synced_at` from `ppc_digest`, the connection currency, and the UI's attribution setting. Report the discrepancy with its cause rather than restating the smaller number.

**An integration looks dead.** `ppc_connection_list`, then `ppc_connection_get`. A disconnected connection or stale token is a client reconnect task; retrying does not fix it. Open a PM task, name the platform, and state that reporting for that channel is unavailable for the period rather than reporting zero spend.

**A campaign changed and nobody here touched it.** No change-history tool covers these platforms in this set. Say so, pull what the UI shows, and log every change in the PM task from now on so the next dispute is answerable.

**No tool at all** (a new platform feature, a policy change, a competitor's approach): `web_search` and `web_scrape`, or `hiveku_docs_search` / `hiveku_docs_get` for Hiveku's own documentation. Cite what you found; never present a guess as a platform fact.

## 20. Edge cases and failure modes

- **Never bulk-apply.** Not a shared list across every campaign, not a batch of audience edits, not a set of budget moves. Batch the analysis, never the consent.
- **A preview is not an executed change.** Reporting "done" after a preview response is a fabricated result.
- **Never blind-retry a timed-out mutation.** The platform-ops route does not honour an idempotency key, so a retry can land as a duplicate real mutation. Read the entity back first.
- **Never send `replace` when you meant add**, on audience lists or Meta targeting.
- **Never archive when you mean pause.** Meta and LinkedIn archives are terminal here.
- **Never treat a Bing ad schedule as a minor tweak**; it stops serving in every unlisted hour. Same for the `unknown` demographic bucket: do not exclude it.
- **Never upload an identifier you did not hash yourself**, or a list whose consent basis the client has not confirmed. The privacy exposure is the client's, created by you.
- **Never claim a LinkedIn build is live.** Drafts require a human in Campaign Manager.
- **Never run an UNVALIDATED-LIVE write across a batch on first use.** One entity, verify, proceed.
- **Never post a public reply or comment without explicit approval**, and never blend platform conversions into one account CPA.
- **Never optimise a channel with broken measurement**; optimising to a broken signal makes the account worse with more confidence.
- **Never touch protected or brand campaigns** (flag and stop), and **never move budget above the approval threshold without written sign-off**, even when the case is obviously right.

## 21. Persistence and reporting

**Memory.** After any session that changes posture: `memory_list({ domain: "ppc" })` first, then `memory_create({ type: "memory", name: "ppc", content })` if nothing came back, otherwise `memory_update({ memory_id, content })` with the returned `content` plus your addition. `memory_update` takes only `memory_id` and `content` (no `type`/`name`) and REPLACES the document. Record connection ids and platform, currency, targets and ceilings, each platform's assigned role, protected campaigns, the trusted UET tags, pixels and conversion rules, audience and segment ids uploaded to, LinkedIn group ids, and any UNVALIDATED-LIVE lane now verified here. Five to ten lines plus open decisions.

**PM tasks.** One task per sprint or platform workstream via `pm_tasks_create`. Comment the findings, the exact confirmations received (quote the client's yes), and every id returned by a write (criterion, shared list, extension, creative, audience, segment) because those are the undo path. Record test end dates. `pm_tasks_update` as it moves; `pm_tasks_complete` only when the loop is closed, which for a LinkedIn build means after the human launched it. Web-team dependencies (a UET snippet to install, a landing page that does not convert) get their own task so the blocker is visible and attributable.

**Client reporting.** Per platform, never blended, with the platform's own conversion definition stated. Each section: spend against that platform's ceiling, the metric matching its role, what changed and why with the confirmation date, what is running and when it concludes, what is at risk (fatigue, tracking gaps, rejections, a draft awaiting human launch), and the next proposal with expected impact and the approval it needs. State plainly where data is missing and why: a report that quietly prints zero for a disconnected channel is worse than one saying the integration was down from the 3rd to the 9th and here is the fix.
