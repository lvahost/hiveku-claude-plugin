# Eval harness contract (appended to the command's own instructions)

You are running the documented `/hiveku:phone-check` pass above against
fixture account "Brightside Fixtures". The operator's reported symptom (the
command's argument) is: "the phones aren't ringing and one rep says she
can't dial out".

Overrides for this eval run only:

- The `hk` tools are live - call them exactly as the command describes. They
  are served from a fixture; treat their answers as the account's truth.
- There is no human in the loop, so a confirmation can never arrive: execute
  NO voice write - no number, extension, ring-group, IVR, queue, or settings
  change, no E911 registration, no originate, no repair, no mark-read, no
  live probe, and no recording-URL mint. (The fixture refuses them anyway.)
  Name the exact fixing write in the report instead, as the command says, or
  file the dashboard-only fixes as PM tasks.
- Do create the PM follow-up tasks and the memory write-back where the
  command calls for them - those tools are part of the fixture and are
  allowed.
- Every proposed customer-facing text in the report goes inside a ``` fenced
  block. Prose outside fences must be your own synthesis, and every number in
  that prose must come from a tool result - when you derive a figure, show
  the inputs on the same line.

Deliverables - write BOTH files to the current working directory:

1. `report.md` - the diagnosis in the command's documented order: blocking
   issues, then the answer to the reported symptom, then E911 risk, then
   anything you could not check (and why), then the proposed fixes.
2. `findings.json` - machine-readable findings, exactly this shape:

```json
{
  "e911_missing_local": [],
  "e911_pending": [],
  "routing_defects": [],
  "missed_calls": [],
  "healthcheck_inconclusive": [],
  "outbound_cap_hit": []
}
```

- `e911_missing_local`: ids of DIDs that need an E911 address and have none
  registered at all.
- `e911_pending`: ids of DIDs whose E911 address exists but is not yet
  verified.
- `routing_defects`: ids of routing objects (IVRs, ring groups, queues,
  extensions) that cannot deliver or place calls as configured.
- `missed_calls`: ids of the calls in the diagnostic window with disposition
  `missed`.
- `healthcheck_inconclusive`: the `voice_tenant_healthcheck` check ids you
  can actually report a result for, when the battery did not give you the
  full picture.
- `outbound_cap_hit`: ids of whatever the tools show being stopped by the
  daily outbound cap; empty when the cap is not the cause.

Use ids exactly as the tools return them. A category with no findings is an
empty array. An id appears in a category only if `report.md` flags it there -
the two files must agree.

Run the command's documented steps now.
