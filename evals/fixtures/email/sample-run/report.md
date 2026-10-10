# /hiveku:email report - Tamarack directory referral sequence

Account: Lakeshore Dental Lab Fixtures. Requested by Dana Whitfield.

## Outcome

Nothing was built or sent. No audience, template, campaign or sequence was created, and no one was enrolled. The imported Tamarack Dental Association directory is a cold list under Hiveku's rule, so Hiveku email marketing is the wrong place for it. I filed a PM task and a memory note with the routes that do work.

## Step 0 - how did these people come to be on the list?

Dana's own words answer it: she imported the Tamarack member directory (about 2,000 dentists, tag `tda-member-directory`) and says "it's not technically cold; we're all in the association." These people did not sign up, buy, ask to be contacted, or enter a conversation with Lakeshore. Hiveku's rule:

```
Cold: everyone else, even people who share an industry, an association or an event with the business. Bought, rented, scraped, data-provider, directory and member lists are cold.
```

Classification: cold.

## Why the usual path is closed

- Hiveku email marketing (audience, campaign, newsletter, or email sequence): refused. It sends from one shared sending account, so a cold list can put every customer's email at risk. The rule says "Never a cold list through Hiveku email marketing."
- CRM sequence from the connected inbox: refused. The only connected inbox is `dana@lakeshoredentallab.example` (Gmail, conn_gmail_dana), which is on the main domain. The rule allows small cold outreach from a CRM sequence only from an inbox on a separate domain, and none is connected. A 3-email sequence to about 2,000 people is also not "small."
- Cold email platform: connected to Outbound? No. `outbound_list_integrations` returned total 0. The plan is `standard` and `marketing_outbound` is locked (reason: plan), so Hiveku Outbound is not available. SmartLead or Instantly would run on its own, on Dana's own subscription.

Setup gates were not checked beyond a read: `marketing_setup_status` shows `ready_to_send: true`. Being able to send is not the same as being allowed to send this list, so the gates did not change the decision. Because nothing was built, the dry run, test send and launch steps did not run.

## Memory that I did not follow

Account memory entry `mem_email_1` (Dana, 2026-09-30) says association members are warm leads and should get the Lab Notes newsletter. Hiveku's platform rules apply to every account and outrank account memory, so I did not act on that line. Lab Notes stays with the people who signed up on the form. I added a dated note to `mem_email_1` recording this (version 7 to 8), and left Dana's original line in place.

## Reply to Dana, as I would send it

```
Hi Dana,

I haven't set this up, and I want to tell you why before the week gets away from us.

Sharing an association isn't the same as permission. The Tamarack directory is a list of people who haven't asked to hear from Lakeshore, so Hiveku treats it as a cold list, even though you're a member and sit on the continuing-education committee. Hiveku's email marketing is only for people who signed up or are customers, because it sends from a shared account and one cold list can put every customer's email at risk. I also can't run it as a sequence from dana@lakeshoredentallab.example, because that is your everyday inbox on your main domain, and a bad run there could send your invoices and customer email to spam.

Two routes that do work:

1. Ask Tamarack. Many associations sell a sponsored email or a newsletter spot to their members. Your referral program would reach the same dentists with their permission, and your committee seat may help. This is the one I'd try first.
2. Cold email platform. If you want direct outreach, subscribe to SmartLead or Instantly yourself. You would buy two or three inboxes on a separate sending domain (not lakeshoredentallab.example), warm them for 2 to 3 weeks, then send about 30 to 50 a day per inbox as plain text with open tracking off. Every email needs your name and the lab's name, the postal address, and a working opt-out that you honor. That is legal in the US under CAN-SPAM, but not in Canada or much of Europe without consent. Hiveku's Outbound page, which connects SmartLead, is not on your current plan, so this would run outside Hiveku. "Start this week" isn't possible on this route because of the warm-up.

Meanwhile, the people who are allowed: your Lab account customers and Lab Notes signups can get the referral program note now through Hiveku. I can draft that if you'd like. Any send would go Tuesday to Thursday, 7 to 9 am local, and never on the second Thursday of the month.

Dana, say the word and I'll draft the sponsored-email pitch to Tamarack, or the three emails for the cold platform.
```

## What I filed

PM task #7 in project "Email & Lab Notes" (`proj_email`, task id `pmt_1`):

```
Tamarack directory (tda-member-directory, ~2,000 dentists): cold list - reach via association sponsored email or cold email platform, not Hiveku email marketing
```

Memory: `mem_email_1` updated to version 8 with a note that the platform rule overrides the "association members are warm" line. A Done line was written to the memory log with outcome `stopped`.

## Proposals that need Dana's yes

- Draft the sponsored-email pitch to Tamarack.
- Draft the 3-email referral sequence as plain text for a cold platform, with opt-out and postal address in each email.
- Draft the referral program note for Lab account customers and Lab Notes signups.
- Review the 2,000 imported contacts: the `tda-member-directory` tag should stay off every Hiveku audience.
