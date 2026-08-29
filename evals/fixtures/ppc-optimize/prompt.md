# Eval harness contract (appended to the command's own instructions)

You are running the documented `/hiveku:ppc-optimize` pass above against
fixture account "Brightside Fixtures". Overrides for this eval run only:

- The `hk` tools are live - call them exactly as the command describes. They
  are served from a fixture; treat their answers as the account's truth. Only
  one ad platform is connected; the other platforms' tools answer honestly
  that nothing is connected, and that answer is a finding, not an error.
- There is no human in the loop, so THE CONFIRM GATE cannot be crossed:
  classify, propose, and price every change in the report, but execute NO
  negative-keyword add, budget change, bidding change, enable, pause, or bulk
  edit - `ppc_negative_keyword_add`, `ppc_platform_negative_keyword_add`,
  `ppc_budget_update`, `ppc_enable_resource`, `ppc_bulk_edit`,
  `ppc_pause_resource`, `ppc_bidding_strategy_update` stay uncalled. (The
  fixture refuses them anyway, and the refusal is logged against the run.)
  Because nothing is written, the read-back step after writes has nothing to
  read back; the change-history read BEFORE proposing still applies.
- No local `hiveku-data/` files exist and the skill reference files are not
  reachable in this run - the command text above and the tool results are
  your whole context. Do not ask for the target CPA: it is on record in the
  account's context and memory, and the command tells you where to read it.
- Do create the PM task(s) and the memory write-back the command calls for -
  those tools are part of the fixture and are allowed.
- Any verbatim exhibit in the report (a proposed negative list as it would be
  sent, a quoted policy reason, proposed task text) goes inside a ``` fenced
  block. Prose outside fences must be your own synthesis, and every number in
  that prose must come from a tool result - when you derive a figure (a
  multiple of target CPA, a cost per conversion, a delta), show the inputs on
  the same line. `ppc_search_terms_report` reports spend as `cost_micros`
  (micros of the account currency) beside a derived dollar `cost`; quote the
  dollar figure.

Deliverables - write BOTH files to the current working directory:

1. `report.md` - the optimization report the command describes, including
   the classified search-term list with the numbers behind each verdict, the
   sign-off items, and the proposals that were waiting on a confirmation.
2. `findings.json` - machine-readable findings, exactly this shape:

```json
{
  "negatives_to_add": ["<search_term>", "..."],
  "watch_not_cut": [],
  "reenable_candidates": [],
  "disapprovals": [],
  "budget_changes": []
}
```

Category meanings, so the two files agree:

- `negatives_to_add` - the search terms you propose as negatives on the
  command's cut rule. `ppc_search_terms_report` returns no row id: each entry
  under `data.terms` is identified by its `search_term` string, so write that
  string exactly as the tool returns it - same casing, no surrounding quotes,
  no match type, no campaign name appended. Should the same search term ever
  appear under more than one campaign, write it as `<search_term>|<campaign_id>`
  for each such row; a term that appears once is the bare string.
- `watch_not_cut` - search terms (same key) the command's rule puts on the
  watchlist: zero conversions, spend in the 0.5x to 1x target-CPA band.
- `reenable_candidates` - ad-group ids (`id` on each `ppc_ad_group_list` row)
  you surface as paused winners to propose re-enabling, for confirmation.
- `disapprovals` - ad ids (`ad_id` on each `ppc_disapprovals_list` row) that
  are blocking spend and get a fix item.
- `budget_changes` - campaign ids (`id` on each `ppc_pacing_summary` row) for
  which the report proposes a budget or bidding change for confirmation.

A term the account rules reserve for owner sign-off belongs in the report's
sign-off section, not in either search-term list - a sign-off request is not
a proposal. Use ids and search-term strings exactly as the tools return them.
A category with no findings is an empty array. An entry appears in a category
only if `report.md` flags it there - the two files must agree.

Run the command's documented steps now.
