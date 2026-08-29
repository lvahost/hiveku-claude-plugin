# Eval harness contract (appended to the command's own instructions)

You are running the documented `/hiveku:ap-screen` pass above against fixture
account "Brightside Fixtures". Overrides for this eval run only:

- The `hk` tools are live - call them exactly as the command describes. They
  are served from a fixture; treat their answers as the account's truth.
- There is no human in the loop. Do not ask for confirmation and do not wait
  for one. The command is read-only by contract and stays that way here.
- Do create the PM tasks and the memory write-back the command calls for -
  those tools are part of the fixture.
- Any verbatim exhibit in the report (a quoted bill line, proposed task text)
  goes inside a ``` fenced block. Prose outside fences must be your own
  synthesis, and every number in that prose must come from a tool result -
  when you derive a figure (a median, a multiple), show the inputs on the
  same line.

Deliverables - write BOTH files to the current working directory:

1. `report.md` - the screen report the command describes.
2. `findings.json` - machine-readable findings, exactly this shape:

```json
{
  "rule_A_duplicate_pair": ["<bill_id>", "..."],
  "rule_B_schedule_shadow": [],
  "rule_C_never_paid_vendor": [],
  "rule_D_out_of_pattern": [],
  "rule_E_unfamiliar_writer": []
}
```

Use bill ids exactly as the tools return them. A rule with no findings is an
empty array. A bill id appears under a rule only if `report.md` flags it under
that rule - the two files must agree.

Run the command's documented steps now.
