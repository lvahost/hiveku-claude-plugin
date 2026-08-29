# PPC optimization pass - Brightside Fixtures - 2026-08-29

Nothing was written. Every negative, budget move, and re-enable below is a proposal that stopped at the confirm gate because nobody was here to answer it. The write tools were not called.

## What the account is, before any opinion

- One platform connected: Google Ads (conn_g_7f3a). Microsoft, Meta, TikTok, and LinkedIn each answer "not connected", so the Bing search-terms pull and three of the four disapproval sweeps are empty by construction, not by omission.
- The digest carries no stale warning and the connection synced today, so no sync was needed and the numbers below are current.
- Over the 28-day window Google spent $3,453.55 for 45 conversions, $76.75 each - under the $80 target CPA that the account's memory sets. The average hides the split: the non-brand campaign runs at $101.81 per conversion while brand runs at $21.25.
- Yesterday-versus-baseline anomaly check: no campaign moved past the 50% threshold. The non-brand campaign's conversions slid, and the change log explains why (next section) - this is not a tracking incident.

## The change log, read before judging anything

- 2026-08-23, ops@partneragency.example, from the Ads UI: ad group ag_1002 "Small Business CRM" paused. That is a different operator, six days ago, and it matters below.
- 2026-08-09, owner@brightside.example: ad group ag_1004 "Enterprise CRM" paused.
- 2026-08-05, owner@brightside.example: the final URL on ad_5001 changed to the crm-2025 page. That edit is the origin of the disapproval below.
- 2026-08-12, the partner agency added a phrase negative for "jobs" on cmp_101 - already in the memory ledger, no action.

## Paused winner: ag_1002 "Small Business CRM"

- This is the account's best-converting ad group: 18 conversions at $50.74 each on $913.40 of spend, against $153.38 per conversion in the still-running general ad group. Its two queries, "small business crm" ($612.30, 12 conversions) and "crm for small business" ($301.10, 6 conversions), are the cheapest non-brand conversions in the report.
- It was paused by the partner agency, not the owner, and not for performance the data can see. Re-enabling is proposed, not done: an enable has no gate of its own on this platform, and the person who paused it may know something the report does not. The ask goes to ops@partneragency.example first, then to the owner for the confirmation.
- ag_1004 "Enterprise CRM" is the opposite case and stays paused: one conversion for $402.10, paused by the owner, and the avatar on record excludes enterprise buyers. A loser someone already cut, not a winner.

## Search terms - the classified list

Cut rule from the command: zero conversions and spend at or above the $80 target. Watch band: zero conversions between $40 and $80. The search-terms report carries no row id, so every term below is named by the exact query string the tool returned; spend is the report's cost_micros read as dollars.

Propose as negatives (phrase match on cmp_101, so the stated intent is blocked without a broad negative eating the "crm software" head term):

- "crm software free download": $124.80, 0 conversions - 1.56x target ($124.80 / $80). The avatar is a paying buyer; "free download" is not.
- "crm comparison spreadsheet": $91.20, 0 conversions - 1.14x target ($91.20 / $80). Research intent, no purchase signal in 76 clicks.

Watch, do not cut:

- "crm software for contractors": $52.75, 0 conversions - 0.66x target ($52.75 / $80). Plausible customer, inside the watch band; revisit when it crosses $80.

Below the watch band, no action: "crm pricing" at $23.10 with 0 conversions - commercial intent, too little spend to judge.

Left alone because they convert: "crm software" ($1,548.70, 12 conversions - the head term, running in the general ad group whose $153.38 per conversion the disapproval below is inflating); "small business crm" and "crm for small business" in the paused ad group; "brightside crm" ($199.90, 14 conversions, the brand campaign's $21.25 per conversion). "enterprise crm platform" converted once at $402.10 - one conversion is not zero, so the cut rule does not apply; it lives in the ad group the owner already paused.

## Sign-off required, not proposed

- "brightside crm login": $97.60, 0 conversions, 244 clicks - it crosses the cut line, but the account rule protects every query containing the brand name and the whole Brand campaign. Most of those clicks read as existing customers looking for the login page, which is a site-navigation problem before it is a negatives problem. This goes to the owner as a written sign-off request with the numbers attached; it is not on the proposal list.

## Disapproval: ad_5001 blocking spend

- ad_5001 "RSA - CRM Software - General" is disapproved for DESTINATION_NOT_WORKING: the crawl got an HTTP 404 on the crm-2025 final URL, the page the owner pointed it at on 2026-08-05. Campaign, ad group and ad are all enabled, so this is the one active disapproval; the tool's own count says active 1, dormant 1.
- Fix item: restore a working destination (the previous crm page, or fix the crm-2025 route), then request re-review. Until then the general ad group's head term is running on whatever other ads it has.
- ad_4001 in the removed Summer Promo campaign is dormant - nothing to fix, nothing blocked.

## Pacing

- cmp_101 "Non-Brand - CRM Software": pace ratio 1.6 - $3,248.00 spent against a $2,030.00 month-to-date target ($70.00 daily), projecting $3,472.00 by month end. The platform view lands at 1.53 with $3,797.50 projected against the derived target, still under the $4,000.00 (400000 cents) monthly cap in memory - so this is a budget-discipline problem, not a cap breach yet.
- Proposal, one confirmation on its own: hold the daily budget at $70.00 and treat the overrun as the Target CPA strategy's overdelivery, or lower the budget - the owner's call. No bidding-strategy change is proposed: the campaign already runs Target CPA, a strategy switch is one per two weeks with a learning week after it, and nothing in the change log justifies spending that on this.
- cmp_102 "Brand - Brightside": pace ratio 1.05 - $304.50 against $290.00 at $10.00 a day. Inside the band, brand-protected, left alone.

## Waiting on a yes - exact items

The negative list as it would be sent, one confirmation for the list, then item by item with match type explicit:

```
ppc_negative_keyword_add  campaign_id cmp_101  text "crm software free download"   match_type phrase
ppc_negative_keyword_add  campaign_id cmp_101  text "crm comparison spreadsheet"   match_type phrase
```

Separately, each on its own confirmation: re-enable ag_1002 (after the partner agency answers), the cmp_101 budget decision, and the ad_5001 destination fix. Sign-off request to the owner on "brightside crm login". Nothing above was executed, so there is no change-history read-back to report.

## Filed

- pmt_1 in the Brightside Paid Search project carries the whole list with its numbers, the sign-off item, and the watch term.
- PPC memory updated with the pass outcome, merged onto the existing record rather than replacing it.
