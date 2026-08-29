# Social week plan - Brightside Fixtures - week of 2026-08-31

Drafts only. Ten posts were created with no scheduled_at, so each sits at status draft; nothing is scheduled, nothing was published, and social_publish_post was not called. The slot proposals below wait for a yes.

## Who can actually post this week

- Three accounts are healthy and carry the drafts: LinkedIn (sacc_linkedin_01, 2140 followers), Instagram (sacc_instagram_01, 3875) and Facebook (sacc_facebook_01, 1560). Each shows can_post true with an empty last_error.
- X (sacc_twitter_01, 980 followers) is the trap: its connection_status still reads connected and is_active is still true, but can_post is false and last_error records an OAuth refresh failure on 2026-08-26. A filter on the status word alone keeps it; a draft aimed at it would land as a failed version at the cron with nothing surfacing in this view. No draft targets it, and a reconnect task is filed below.
- The same fault explains last window: zero X posts is the broken token, not a content decision, so the mix below is computed over the three working platforms.

## Where the ratio drifted, and what the week does about it

- Last window (the trailing seven days the summary always reports, ten published posts by created_at): Educate 1 of them (10%) against a 40% target, Authority 3 (30%) against 25%, Connection 4 (40%) against 20%, Promotion 2 (20%) against 15%. Two older Educate posts sit just outside that window; counting them would read Educate as three of twelve, still the only pillar under target.
- The account's own results point the same way as the targets. The best post of the window was its lone Educate piece (post_lw_07: 486 engagements on 9800 impressions) and the worst was a Promotion (post_lw_03: 41 on 2100). Engagement rate sits at 4.5% on 48200 impressions and 2170 engagements, down 8.8% on the prior window while impressions rose 6.2% - reach held and the mix slipped.
- The rebalance: Educate 5, Authority 2, Connection 2, Promotion 1 - ten drafts, Educate at half the week. A strict two-week catch-up to the targets would put Connection at zero, and a pillar with no post in a week breaks the same cadence rule that forbids a dark platform, so Connection keeps two and Promotion keeps its one. Promotion at one in ten keeps the value-to-promotion frame intact.

## The week (drafts with proposed slots, none scheduled)

Times come from the account's own data, read in the command's order: social_schedule_slot_next_open first (twelve open occurrences across the horizon, six of them inside this week; none holds a post yet, and the Saturday slot is left open on purpose for a reactive post), then social_analytics_best_times for the second post on a day. Every draft is one platform and one account.

| Day | Proposed time (America/Chicago) | Platform | Pillar | Draft |
|---|---|---|---|---|
| Mon 08-31 | 09:00 morning slot | LinkedIn | Educate | post_new_1 - The hinge, not the door: the second screw |
| Mon 08-31 | 08:00 best time | Instagram | Educate | post_new_2 - Two screws, one even gap |
| Tue 09-01 | 12:00 lunch slot | Facebook | Educate | post_new_3 - Lacquer or oil for a working kitchen |
| Tue 09-01 | 09:00 best time | LinkedIn | Authority | post_new_4 - Harlow Street: the pipe that was not on the drawing |
| Wed 09-02 | 12:00 best time | Instagram | Connection | post_new_5 - Saturday, second bench |
| Wed 09-02 | 09:00 morning slot | LinkedIn | Educate | post_new_6 - Soft-close hinges fail at the damper |
| Thu 09-03 | 12:00 lunch slot | Facebook | Authority | post_new_7 - How a door gets finished here |
| Thu 09-03 | 09:00 best time | Instagram | Educate | post_new_8 - Brass pulls: clean, do not strip |
| Fri 09-04 | 09:00 morning slot | LinkedIn | Connection | post_new_9 - The person who answers the phone |
| Fri 09-04 | 16:00 best time | Facebook | Promotion | post_new_10 - Showroom open Saturday: fall hardware on the wall |

Platform split: LinkedIn four, Instagram three, Facebook three - the cadence the account agreed, with no working platform left dark.

## Captions (verbatim drafts, one per post)

post_new_1 (LinkedIn, Educate):

```
Last week we showed which hinge screw lifts a drooping door. This is the other one. The screw nearest the cabinet wall moves the door in and out; the one behind it moves it up and down. Quarter turns, then close the door and look at the gap. Stop when the gap is even. #BrightsideBuilt #CabinetCare
```

post_new_2 (Instagram, Educate):

```
Frame one: the door before, drooping on the handle side. Frame two: after two quarter turns on the depth screw. No new hinge, no new door. Which screw does what is in the caption of our last post. #BrightsideBuilt #CabinetCare
```

post_new_3 (Facebook, Educate):

```
Lacquer gives you a hard shell that wipes clean and chips if you hit it. Oil gives you a soft surface that scratches and repairs with a rag. A house with small children usually wants lacquer. A house that likes to fix things itself usually wants oil. Neither is wrong; pick the one you will live with. #BrightsideBuilt #CabinetCare
```

post_new_4 (LinkedIn, Authority):

```
The Harlow Street vanity had to clear a heating pipe that appeared on site, not on the plan. We cut the back panel around it, kept the drawer full depth, and the client never saw the pipe again. Before and after in the images. #BrightsideBuilt
```

post_new_5 (Instagram, Connection):

```
Saturday again. The showroom is open, the second bench is hanging doors, and the coffee is fresh for once. Come and ask us anything about your kitchen. #BrightsideBuilt #ShopLife
```

post_new_6 (LinkedIn, Educate):

```
When a soft-close door starts slamming, the spring is fine. The damper, the small piston at the hinge cup, has lost its oil. On most hinges it clips off and a new one clips on in a minute. Swap the damper before you swap the hinge. #BrightsideBuilt #CabinetCare
```

post_new_7 (Facebook, Authority):

```
Four passes: a sanding sealer, a sand by hand, the first lacquer coat, a second sand, the final coat. The sand between coats is the step people skip and the reason our doors feel the way they do. Photos from the booth this week. #BrightsideBuilt
```

post_new_8 (Instagram, Educate):

```
Warm water, a drop of dish soap, a soft cloth. That is the whole method for brass pulls. The bottle under the sink takes the patina off in one wipe and it does not come back. #BrightsideBuilt #CabinetCare
```

post_new_9 (LinkedIn, Connection):

```
When you call the shop you get Dana, who has taken every order here for four years and can tell you which finish you asked for last time before you remember. This is her week to be on the page. #BrightsideBuilt #ShopLife
```

post_new_10 (Facebook, Promotion):

```
The fall hardware run is on the showroom wall: aged brass, matte black, and the bronze. Open Saturday from nine until two. Bring a door if you want to see a pull against it. #BrightsideBuilt
```

## Excluded

- sacc_twitter_01 (X) - can_post false, OAuth refresh failed 2026-08-26, still labelled connected. Nothing targets it until the token is renewed in the dashboard.

## Filed

- pmt_1 - reconnect X: the token, not the content, is why the platform went quiet; renew it in the dashboard before anything is aimed there.
- pmt_2 - release the week: ten drafts wait for a yes, with the proposed slots above.
- Social memory updated with the week's rebalance and the lesson of the status word: read can_post and last_error, not connection_status, before trusting an account. The prior document was resent whole with the note appended.

## What happens next

One yes releases the week. Times go on one post at a time with social_update_post into the slots listed above, never through social_publish_post: on an unapproved post that call stages the post into the approval queue and it stops shipping until a human approves it. Approving an unscheduled post in the dashboard publishes it immediately, so the times go on before anyone clicks approve.
