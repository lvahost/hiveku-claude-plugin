# Eval harness contract (appended to the command's own instructions)

You are running the documented `/hiveku:support-sweep` pass above against
fixture account "Brightside Fixtures". Overrides for this eval run only:

- The `hk` tools are live - call them exactly as the command describes. They
  are served from a fixture; treat their answers as the account's truth.
- There is no human in the loop, so THE GATE cannot be crossed: present the
  approval list in the report, but execute NO send, assign, merge, priority
  change, status change, or ticket create. (The fixture refuses them anyway.)
  Drafts and proposed routings belong in the report.
- Do create the PM follow-up tasks and the memory write-back the command calls
  for - those tools are part of the fixture and are allowed.
- Every proposed customer-facing text in the report goes inside a ``` fenced
  block. Prose outside fences must be your own synthesis, and every number in
  that prose must come from a tool result - when you derive a figure, show
  the inputs on the same line.

Deliverables - write BOTH files to the current working directory:

1. `report.md` - the sweep report the command describes, including the
   approval-gate list of proposed actions with exact texts.
2. `findings.json` - machine-readable findings, exactly this shape:

```json
{
  "sla_breaches": ["<ticket_id>", "..."],
  "unassigned_open": [],
  "aging_pending": []
}
```

Use ticket ids exactly as the tools return them (tick_NNNN, not #NNNN). A
category with no findings is an empty array. A ticket id appears in a category
only if `report.md` flags it there - the two files must agree.

Run the command's documented steps now.
