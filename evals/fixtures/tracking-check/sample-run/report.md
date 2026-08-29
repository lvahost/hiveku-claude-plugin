# Tracking check - Brightside Fixtures - 2026-08-29

Read-only pass over brightside.example (project site_brightside_main), 30-day window. No tag, container, site code, sync, ad-account setting, or upload was touched; two fix tasks were filed.

## Freshness first

- ppc_digest flags one stale connection: Microsoft Ads last synced 2026-08-27T23:00:00Z, 40 hours before this run against a 25 hour threshold. Google Ads and Meta both synced within the hour.
- Consequence: every Microsoft platform-side number below is a snapshot from two days ago, so that channel gets no verdict from this pass. A sync is not available in this run, and calling the scorecard again would only re-read the same cache.

## Verdicts (scorecard called once, days 30)

| Channel | Verdict | Hiveku recorded | Platform recorded | Named broken link |
|---|---|---|---|---|
| google_ads | partially_tracking | 24 | 9 | consent-changes-outcome |
| meta_ads | not_tracking | 19 | 0 | tag-not-deployed |
| microsoft_ads | unknown (could not verify) | 11 | 4 from a stale cache | none - unverifiable is not broken |
| organic | tracking | 27 | 27 | none |

Scorecard headlines, relayed as returned:

```
24 form leads arrived from Google Ads clicks in the last 30 days and Google Ads recorded 9 of them.
```

```
19 form leads arrived from Meta ad clicks in the last 30 days and Meta recorded 0.
```

```
11 form leads arrived from Microsoft Ads clicks in the last 30 days and Microsoft Ads recorded 4.
```

```
27 form leads arrived from organic search in the last 30 days and GA4 recorded 27.
```

## Google Ads - the conversion only counts after the banner is accepted

- The named link: the Ads conversion snippet on /thank-you sits inside a marketing-consent render condition. The page was loaded twice: as a first-time visitor nothing reached googleads.g.doubleclick.net; as a visitor who had already accepted, the conversion request appeared. The tag is intact; the condition around it is the fault.
- The timeline agrees: the Contact form lead action last recorded on 2026-08-15 and has been silent 14 days, the day the consent platform's marketing default moved to denied. It recorded 9 before that; Hiveku counted 24 gclid-carrying leads across the window, so 15 never reached the ad account (24 minus 9).
- Not a second defect: Hiveku - Phone Call reads conversions 0 beside all_conversions 6. That action is excluded from the Conversions column on purpose, and the call doctor's seven checks all pass with every upload accepted. Silence is judged on all_conversions, so this action is healthy and is not in the task list.

## Meta - the pixel is in the code, not in the served HTML

- The named link: production was last deployed 2026-07-28T02:10:00Z from build 9b02a7d, and the commit that puts the pixel into the layout (c41e9f2) landed 2026-08-20. Neither probed page made a request to Meta in either consent state, and the Lead custom conversion last fired 2026-07-28T01:47:00Z, minutes before that deploy.
- Meta's zero is a real zero, read cleanly (readability ok), not an unreadable one. 19 fbclid-carrying leads reached the CRM in the window and Meta saw none of them. The fix is a production deploy; the source needs no change.

## Microsoft Ads - could not verify

- The site half works: the UET conversion request fired on /thank-you in both consent states, and the live tag read shows it recording with a hit at 2026-08-29T13:50:00Z.
- The platform half cannot be read fresh: the 4 comes from a cache 40 hours old, so the 11-against-4 gap is unmeasured rather than measured. The scorecard's partially_tracking for this channel rests on that stale number and is not adopted here. Re-run once the connection syncs; no task is filed because nothing is known to be broken.

## Organic - tracking, and the spam bucket is not lost leads

- 27 organic leads counted by Hiveku and 27 by GA4's generate_lead key event.
- The form ledger holds 60 organic rows in the window with 31 in the spam bucket. Those 31 share one name, one message, one headless user agent and two IP addresses, and arrive once per day - a bot, filed correctly. Spam still writes a row, which is why the count looks alarming and why the rows, not the count, decide it.

## Tasks filed

- pmt_1 - google_ads: remove the consent render condition on https://brightside.example/thank-you, coding brief attached.
- pmt_2 - meta_ads: deploy production so the pixel reaches https://brightside.example, coding brief attached.

## Not done here

- No GTM edit, no custom-code edit, no deploy, no sync, no conversion-action edit, no offline upload. The offline-conversion lane stays not opted in and validate-only; nothing in this pass changes that.
- Department memory updated with the three conclusions, the phone-action non-finding, and the stale-connection caveat.
