---
description: "\"Our ads are getting tired\" / \"CPMs are up and clicks are down\" / \"we need new creative\" - the creative iteration loop: the per-platform creative scoreboard, every losing ad classified by the number that condemned it, one rebrief per loser (rebrief, do not rebid), production through the media and storyboard lanes, new ads shipped PAUSED one confirmed write at a time. Nothing is approved or enabled from here without its own yes."
argument-hint: "[optional focus, e.g. a platform, campaign, or ad set]"
---
Creative refresh ($ARGUMENTS). Follow the **hiveku-ppc-agency** skill; the creative standard is
`references/ads-assets-quality.md` (Play 3 test protocol, section 5 RSA build standard) and the
paid-social read is `references/paid-social-and-bing.md` (11 Meta weekly read, 14 TikTok creative
triage, 18 thresholds). Doctrine, 11.4 verbatim: "Rebrief, do not rebid; the write that closes the
loop is new creative, not a budget cut." Production lands through the **hiveku-creative-agency** skill.
1. Context: `account_context_get({ domain: "ppc" })` + `memory_list({ domain: "ppc" })` for target
   CPA/ROAS per platform, protected and brand campaigns (nothing inside one is created, paused, or
   enabled from here - surface it and stop), prohibited phrases from past disapprovals, cleared
   offer claims. `ppc_connection_list` for each platform's connection_id; `ppc_digest` for
   staleness - a connection stale past 25h gets `ppc_sync({ connection_id })` before any read.
2. Not-a-creative-problem gate, before any ad is condemned (paid-social section 4 ladder: delivery,
   measurement, audience, creative, offer - stop at the first failing rung):
   - Delivery: `ppc_disapprovals_list` (Google), `ppc_meta_disapprovals_list`,
     `ppc_tiktok_disapprovals` - a rejected ad has no performance to judge; /hiveku:ppc-optimize.
   - Measurement: zero conversions on healthy clicks is a tracking question first - STOP and run
     /hiveku:tracking-check; a rebrief against a dead pixel is wasted money.
   - Budget: `ppc_impression_share({ connection_id, days: 30 })` (Google-only) - lost-to-budget of
     roughly 20 points or more means starved, not stale (Framework A); that is /hiveku:ppc-shift.
3. The scoreboard, per connected platform, one named 30-day window on every read:
   - Meta: `ppc_meta_insights_breakdown({ connection_id, level: "ad", breakdowns: ["placement"] })`
     (max 3 breakdowns, Meta's cap); rows carry impressions, clicks, spend, actions, reach,
     frequency, cpm, cpc, ctr. Join names and the creative object (image_url / video_id, title,
     body, link_url) via `ppc_meta_creative_list`. The fatigue read, from the tool's own
     description: at level ad, frequency climbing past ~3-4 while CTR falls and CPM rises. Bars
     (paid-social 18): frequency above 3.0 in a 7-day window on prospecting is fatigue, above 2.0
     with falling CTR is the same thing earlier; remarketing tolerates 5 to 7. "Falling" and
     "rising" need a prior period - run the same read over the preceding window, both on the line.
   - TikTok: `ppc_tiktok_creative_report({ connection_id })` (spend descending) - per ad, hook
     rate = video_watched_2s / video_plays, hold rate = video_watched_6s / video_watched_2s.
     Section 14 verbatim: "Weak hook is a first-two-seconds problem, good hook with weak hold is
     a script problem, good hold with no conversions is offer or landing page." Bars: hook under
     20% weak, 30% or better strong; hold under 40% loses people; creative lifespan 7 to 14 days.
     `ppc_tiktok_videos_list` maps ads to source videos, so the rebrief targets the raw asset
     carrying several winners instead of duplicating an ad.
   - Google: `ppc_ad_list({ connection_id, ad_group_id })` per money ad group - headline and
     description counts, final URL, status, ad strength IF returned (absent means not retrieved;
     never inferred from headline count and called Google's grade). The RSA standard
     (ads-assets-quality 5): 12 to 15 headlines, 4 descriptions, both paths, 2 headlines carrying
     the primary keyword verbatim, at most 3 pins and only when compelled; under 8 headlines or 3
     descriptions is under-built. CTR bar: non-brand search 3 to 6% healthy, under 2% at decent
     position is a creative or relevance failure; brand CTR is never blended in.
   A read that errors is NOT RETRIEVED for that platform, never "no fatigue there".
4. Classify every fatigued or losing creative into exactly one bucket, each line carrying the
   number that condemned it and the call it came from:
   - `weak_hook` - TikTok hook rate under 20%; on Meta, fresh creative (frequency under 2.0) with
     CTR below the ad set's median ("low CTR on fresh creative is message-market fit", 4.4).
   - `weak_hold` - TikTok hook at or above 20% but hold under 40%. The script.
   - `fatigue` - Meta frequency past the bar with CTR down and CPM up against the prior period;
     a TikTok ad past 14 days with CTR declining week over week.
   - `offer_or_lp` - hold healthy (TikTok) or CTR healthy (Meta, Google) with actions or
     conversions near zero: "the ad writes a cheque the page does not cash" (Framework A).
   - `structure` - Google RSA under-built, ad strength Incomplete or Poor with any spend, more than
     3 pins, or an ad group down to zero or one enabled RSA. A build defect, not an idea problem.
   Under 10 conversions in the window makes any CPA on the line directional only - say so there.
5. Doctrine, per bucket. `fatigue`, `weak_hook`, `weak_hold`, and `structure` are answered with NEW
   CREATIVE - explicitly not a bid, budget, or audience change: "Rebrief, do not rebid" (11.4), and
   the insights tool's own description says the fix is a rebrief, not a bid or budget change. A
   budget move proposed here is refused and routed to /hiveku:ppc-shift. `offer_or_lp` never
   reaches production: route it to /hiveku:cro, because a better ad buys more of the same
   non-converting click. STOP: present the classification table and get a yes before writing a
   rebrief - the human may know the offer changed last week.
6. One rebrief per approved loser: the ad (id, platform, ad set or ad group), its bucket and
   condemning number, the angle being retired, the replacement angle varied on ONE axis (value
   proposition, proof type, CTA, or offer framing - Framework D), format, and platform spec (9:16
   Reels/TikTok, 1:1 or 4:5 feed, 1.91:1 link card, RSA 30/90/15 character limits). Draft copy
   through `talk_to_department({ domain: "ppc", message })` - the domain the sibling plays use for
   ad copy (ads-assets-quality Play 2, paid-social Play 12) - stating bucket, retired angle, limits,
   and memory's prohibited phrases; the return is a starting inventory edited against the standard,
   never pasted through. Visual direction goes to `{ domain: "branding" }` - there is NO `creative`
   domain; an unlisted value is a server-side rejection.
7. Production handoff, on the creative skill's ladder (reuse before generating):
   - Images: /hiveku:media - `generate_image_set` (up to 10 prompts sharing one brand context,
     `account_context_get({ domain: "branding" })` loaded first; per-prompt failures land in
     `errors[]`, `budget_exceeded` stops the remainder while earlier successes still land) for a
     variant set that must look consistent. Successes auto-register: use the media_asset_ids.
   - Video: `marketing_storyboard_create` (FREE AND FAST - it validates, prices, and stores;
     NOTHING is reserved, billed, or enqueued until a human approves; EXACTLY ONE of `storyboard`
     or `template_id` + `substitutions`; `profile_id` matching the placement), then
     `marketing_storyboard_submit_for_approval({ storyboard_id })` and STOP. The creative skill's
     rule 4 in its own words: "THE AGENT CANNOT APPROVE: after creating, submit for approval and
     stop." and "Nothing approves a storyboard." Report scenes, runtime, itemized cost, and the
     dashboard card; write the storyboard id into the PM task (there is no storyboard list tool);
     end the turn. Never assemble the same video from single `marketing_generate_video` clips.
8. Shipping, honestly per each write path's own description, every write behind its own yes:
   - Google: `ppc_responsive_search_ad_create({ connection_id, ad_group_id, headlines,
     descriptions, final_url, path1?, path2?, pinned_headlines? })` - one ad per call, one
     confirmation per ad, meeting the step 3 standard (count characters first: one over-length
     string fails the whole call). It ALWAYS creates PAUSED. Enabling is a separate write with its
     own yes after the human previews the ad in the dashboard: `ppc_enable_resource({
     connection_id, resource_type: "ad", resource_id, ad_group_id })`. Do not pause the incumbent
     in the same breath: run Play 3 (two RSAs on one axis, ~100 clicks AND ~10 conversions per
     variant or two full weeks, a 15% cost-per-conversion delta to call it), then pause the loser
     with its own confirmation. Microsoft parity: `ppc_platform_responsive_search_ad_create`
     (3+ headlines, 2+ descriptions, also PAUSED).
   - Meta: `ppc_meta_media_upload` (asset-only, spends nothing), `ppc_meta_adcreative_create` (a
     creative alone spends nothing), `ppc_meta_ad_create` (ALWAYS created PAUSED, no status
     parameter exists; serves only once ad, ad set, and campaign are enabled via
     `ppc_platform_enable_resource`). Say it out loud first: the creative and ad descriptions
     both carry "Write path not yet live-validated" (so does `ppc_meta_campaign_push`, which is
     for a whole new LOCAL draft campaign, not a refresh). The reference rule (paid-social 5) is
     ONE creative and ONE ad on first use in this account, verified in the dashboard and via
     `ppc_meta_creative_list` before a second - never a batch. If the operator would rather not
     be first to exercise an unvalidated write, or the first entity does not verify, the
     deliverable is `pm_tasks_create({ project_id, title })` carrying copy, asset ids, ad set ids,
     and specs for the dashboard operator - never a claim that the ads are up.
   - TikTok: no ad-create tool exists here and `ppc_tiktok_creative` states "Media UPLOAD is not
     supported here" - the deliverable is the `pm_tasks_create` brief (asset ids, script, hook,
     spec) for the dashboard operator. Say so; never imply a TikTok ad was shipped.
9. Read-back: `ppc_ad_list({ connection_id, ad_group_id })` after each Google create (record the
   returned resource_name - needed to pause it later); `ppc_change_history` after each Google
   enable (it is a Google Ads changes-API read; no platform-side change history covers Meta or
   TikTok in this tool set, so after a Meta or TikTok enable the read-back is `audit_query`, per
   `references/paid-social-and-bing.md` section 19);
   `ppc_meta_creative_list` after a Meta creative; `ppc_sync({ connection_id })` on every touched
   connection so the digest agrees with what was written. Then the client's table: per loser,
   bucket, condemning number, replacement angle, where it is now (paused ad id, storyboard awaiting
   approval, PM task for the dashboard), and what could not be retrieved. Refresh clock
   (paid-social 18): 3 to 5 new Meta creatives per active ad set per month; no new creative in 60
   days means decline regardless of bidding - put the next refresh date on the PM task.
10. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
