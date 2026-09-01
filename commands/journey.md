---
description: "\"Map the customer journey\" / \"where are we losing people?\" / \"what content do we need and why?\" - build or audit a customer journey map: link the ICPs, work every transition with TRAFFIC/HOOK/CONVERT, attach what exists and brief the gaps, set the checkpoints that make the funnel measured, then aim the next assets at the weakest transition using real ROI. Writes briefs, never produces the assets."
argument-hint: "[optional: a journey name or id, or 'new' to build one]"
---
Customer journey work ($ARGUMENTS). Follow the **hiveku-content-agency** skill and **load
`references/customer-journey.md` before anything else** - the awareness spine, the
TRAFFIC/HOOK/CONVERT rule, the brief-versus-link coverage model, the checkpoint contract and
how to quote ROI honestly all live there. Do not improvise a methodology; this one is
opinionated on purpose.

1. **Ground yourself.** `account_context_get({ domain: 'customer_journey' })`. Skipping it is
   the most common cause of a journey that sounds like nobody's business in particular.

2. **Find or create the journey.** `customer_journey_list`. With no argument, audit the most
   recently updated one and say which you picked. With `new`, ask what the business sells and
   to whom before creating anything - a journey created from a template and never tailored is
   worse than none, because it looks finished.

3. **Audit before you touch it**, in this order, reporting as you go:
   - `customer_journey_stage_list` - every stage must have a `stage_id`. A null one is
     invisible to every tool that addresses stages by id; repair it first.
   - `customer_journey_avatar_list` - is a persona linked, and the right one? No persona
     means the map is for nobody. Link with `customer_journey_avatar_link`.
   - `customer_journey_stage_assets_list` - the coverage map. Linked assets are coverage,
     proposals are named gaps, and a stage with neither is a gap nobody has named.
   - `customer_journey_roi_get` - `funnel_mode`, the weakest transition, and whether `drift`
     is set. If `funnel_mode` is `estimated`, say so every time you quote a number from it.

4. **Name the single weakest transition.** Not the weakest stage - money is lost between
   stages. Say what belief has to change there and why the current assets do not change it.

5. **Work that transition with all three legs.** TRAFFIC, HOOK and CONVERT, each written out.
   Search for existing content first and attach it with
   `customer_journey_stage_asset_attach`; brief the gaps with
   `customer_journey_stage_asset_propose`, batching via `proposals: [...]`. Put the real
   thinking in `proposal.brief` - the job at this stage, the key message, the format. **Write
   the hook, do not describe it**: these briefs render to prospects on the public journey page.
   For a leg another department owns, ping it and propose their idea attributed rather than
   inventing creative solo.

6. **Make it measurable.** If `funnel_mode` is `estimated`, set checkpoints with
   `customer_journey_stage_update({ checkpoints })` - stage 1 needs one for entry, and some
   stage needs an `is_exit`, or the funnel stays a proxy. At most one `is_exit` per stage.
   Scope each signal (a `page_visit` without `project_id` fires on every site the account
   owns).

7. **Imagery, if the map needs it.** `marketing_generate_entity_image({ journey_id, stage_id,
   prompt })` files the image onto the stage and carries actor anchoring, so one recognisable
   person walks the whole journey. Confirm before spending: it bills the account's
   image-generation allowance.

Rules for this command:
- **Snapshot before any rewrite** - `customer_journey_version_create`. And never call
  `customer_journey_version_restore` without confirming with the human: the first call performs
  the restore, and restoring `stages` restores its stage_id values, orphaning assets and
  checkpoints keyed to ids that differ.
- **Edit one stage at a time** with `customer_journey_stage_update`, not a whole-blob
  `customer_journey_update`.
- **This command writes briefs. It does not produce assets.** Production is a separate,
  confirmed act through the owning department.
- **On a thin journey, thinness IS the finding.** Report it plainly rather than filling the
  map with plausible-sounding stages nobody will use.
