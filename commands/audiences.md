---
description: "\"Are our remarketing audiences doing anything?\" / \"upload this customer list to Google\" - audience pass: which attached audiences earn their bid modifiers, list hygiene against the volume gates, and the Customer Match upload done without touching raw PII."
---
Audience pass. Load the **hiveku-ppc-agency** skill and read its
`references/audiences-and-remarketing.md` BEFORE acting - the value ladder, the
observation/targeting/exclusion framework, the privacy gate, the section 8 threshold tables, and
the normalize-then-hash rules live there, not here. Context: `account_context_get({ domain: "ppc" })`,
then `memory_list` for consent posture, protected campaigns, and the approval threshold.
1. **Performance:** `ppc_audience_performance({ connection_id, days: 30 })` - per attached
   audience: metrics plus the current bid_modifier. Judge as an INDEX against the parent campaign,
   never on absolute CPA (remarketing pre-selects already-interested people, so a low CPA proves
   selection, not causation - say so; no tool here measures incrementality): CPA index = audience
   CPA / campaign CPA, baseline from campaign metrics or `hiveku-data/ppc/metrics_daily.json`.
2. **Bid modifier changes**, one at a time. Bands from `references/audiences-and-remarketing.md`
   section 8: index <= 0.70 with volume = strong promote (+20 to +30 percent, or build the
   targeted twin the section describes), 0.70 to 0.85 = promote (+10 to +20 percent), 0.85 to
   1.20 = noise, no action, 1.20 to 1.50 = watchlist (re-read in 30 days), >= 1.50 = demote
   (-10 to -30 percent), and cost >= 2x target CPA with zero conversions = exclude, not a
   modifier change. Volume gate
   first (30 days elapsed AND 100+ clicks AND 5+ conversions in the segment, same section): below
   it the honest answer is "keep observing" - say that rather than invent a conclusion. For EACH
   surviving change: STOP - present the audience, the current and proposed modifier, and the index
   and cost numbers behind it, and wait for an explicit yes. Then
   `ppc_bid_modifier_update({ target_type: "audience", target_value, bid_modifier })` - ONE change
   per confirmation, never a batch - and read it back (`ppc_audience_performance` returns the
   current bid_modifier) before proposing the next.
3. **List hygiene:** `ppc_google_user_lists` (operation `user-lists-list`) - every list with sizes
   and eligibility. Flag: lists under the serve minimums (1,000 members for Search/RLSA, 100 for
   Display, 1,000 MATCHED for Customer Match - reference section 8); lists flat across two reads
   24-72h apart (a flat list on a trafficked site is dead, not small); healthy lists attached
   nowhere (the highest-value inventory finding). Before promising an audience will move a
   smart-bidding campaign, check the campaign clears SKILL.md section 9's volume gates (15 conv/30d
   for max_conversions, 30+ for target_cpa, 50+ with values for target_roas) - under smart bidding
   a modifier is ignored for ranking and earns its place as reporting and signal only. Quarterly
   decommission per the reference's Play 8: `ppc_audience_detach` everywhere first (reversible),
   verify nothing broke for a week, then remove via `ppc_audience_ops` (irreversible) - STOP and
   confirm per list, never as a batch. New prospecting segments go through
   `ppc_custom_audience_create` (populates in hours to days - do not judge it on day one), and
   `ppc_audience_attach` RESTRICTS serving to members - observation mode is
   `ppc_bid_modifier_update` at 1.0, and the reach tradeoff gets its own STOP and confirmation.
4. **Customer Match** - only when the user brings a list, never invented. Consent comes FIRST and
   OUT LOUD: ask the user to state the lawful basis and to confirm consent for both `ad_user_data`
   and `ad_personalization` before step one; record the answer in memory. Only then the contract
   of `ppc_customer_match_upload`, exactly:
   - It accepts SHA-256 PRE-HASHED identifiers ONLY - raw emails or phones are rejected with
     `raw_pii_rejected`, and raw PII never appears in a tool argument, file, comment, or memory
     entry. The normalize-THEN-hash rules (lowercase+trim email, E.164 phone, hex lowercase) are
     in `references/audiences-and-remarketing.md` Play 4 - follow them or the match rate craters.
   - The target user_list must already EXIST - get `user_list_id` from `ppc_google_user_lists`
     `user-lists-list`. Creating a customer-match container list is an Ads UI Audience Manager
     action, not a tool call on this surface - say so honestly instead of improvising one. Submit
     5,000+ records to clear the 1,000-matched serve floor reliably (reference section 8).
   - It is a TWO-STEP CONFIRM: the first call (without `confirm`) uploads NOTHING and returns a
     dry-run preview with `requires_confirm: true`. STOP - show the user the preview counts, and
     only on their explicit yes repeat the IDENTICAL call with `confirm: true`.
   - A 200 is not success: report accepted vs submitted from the response, and verify list sizes
     only at 24-48 hours - a zero right after upload means nothing.
5. **Everything not doable from here** (a new CM container list, Meta lookalike or custom-audience
   nuances - separate tools and minimums per `references/paid-social-and-bing.md` - or a consent
   question for legal): one `pm_tasks_create` per item. Present the task list and confirm before
   creating any.
6. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. Hiveku, not this folder, is the source of truth.
