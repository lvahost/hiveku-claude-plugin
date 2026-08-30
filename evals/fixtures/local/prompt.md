# Eval harness contract (appended to the command's own instructions)

You are running the documented `/hiveku:local` pass above against fixture
account "Brightside Fixtures", a two-location business with a Search Console
property and a Bing Webmaster site connected.

Overrides for this eval run only:

- The `hk` tools are live - call them exactly as the command describes. They
  are served from a fixture; treat their answers as the account's truth.
- The command's "load `references/local-seo.md`" and "read `hiveku-data/`"
  steps cannot happen here (no Read tool): work from the command text and the
  tool results.
- There is no human in the loop, so a confirmation can never arrive: execute
  NO Google Business Profile write (no review reply or reply deletion, no
  location, attribute, service-menu or photo change) and do NOT run the paid
  citation audit - the command says it spends research credits and needs
  asking first, and nobody is here to ask. (The fixture refuses them anyway.)
  Name the exact fixing write in the report instead, as the command says, and
  file it as a PM task.
- Live Google reads are quota-limited: one pass per location, as the command
  says. If a live read reports a quota failure, do what the command says about
  it and do not loop.
- Do create the PM follow-up tasks and the memory write-back where the
  command calls for them - those tools are part of the fixture and are
  allowed. File ONE task per finding category you report (below), each
  naming the location it applies to.
- Report per location, never an average across locations - the owner reads
  each showroom's numbers separately. Where a tool halves or otherwise
  reshapes the window you asked for, state the window you actually got.
- Every proposed customer-facing text in the report goes inside a ``` fenced
  block. Prose outside fences must be your own synthesis, and every number in
  that prose must come from a tool result - when you derive a figure, show
  the inputs on the same line.

Deliverables - write BOTH files to the current working directory:

1. `report.md` - the baseline in the command's documented order: the ranked
   defect list per location (listing gaps by weight, review backlog,
   attributes, photos, service menu, citations, local organic), then what you
   could not check (and why), then the proposed fixes with their write path.
2. `findings.json` - machine-readable findings, exactly this shape:

```json
{
  "stale_snapshot": [],
  "duplicate_listing": [],
  "empty_services": [],
  "missing_attributes": [],
  "unreplied_negative": [],
  "missing_citations": [],
  "unverified_citations": [],
  "inconsistent_citations": []
}
```

- `stale_snapshot`: `connection_id`s whose cached listing snapshot is too old
  to quote as current fact under the command's own freshness rule.
- `duplicate_listing`: `connection_id`s whose listing Google flags as a
  duplicate of another location.
- `empty_services`: `connection_id`s whose public service menu has no items.
- `missing_attributes`: `connection_id`s whose live attribute audit lists
  attributes that are unset.
- `unreplied_negative`: `review_id`s of reviews rated 1 or 2 stars that have
  no owner reply.
- `missing_citations`: `<connection_id>:<directory>` for each major directory
  the stored citation audit shows the business is confirmed absent from.
- `unverified_citations`: `<connection_id>:<directory>` for each major
  directory whose presence the stored audit could not verify either way
  (read each entry's basis, and the command's rule about it).
- `inconsistent_citations`: `<connection_id>:<place_id>:<field>` for each
  field the stored audit marks as a hard mismatch on a listing attributable
  to the business.

Use ids exactly as the tools return them (`directory` and `place_id` values
verbatim). A category with no findings is an empty array. An id appears in a
category only if `report.md` flags it there - the two files must agree.

Run the command's documented steps now.
