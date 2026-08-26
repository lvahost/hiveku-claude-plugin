---
description: Seed a new client account's department memory in one call, instead of 20 sequential writes.
argument-hint: "[what the account does, or the intake notes to seed from]"
---

Stand up the memory substrate for a newly bound account$ARGUMENTS. A new account starts with nothing in
`account_ai_memory`, so every department agent runs unhydrated until this is done — that is the state
`account_audit_health` reports as the `no_memory_entries` drift flag.

1. **Check what is already there.** `memory_list({})` for the whole account. If departments already have
   entries, this is not a seed job: use `/hiveku:remember` and read-modify-write each one instead.

2. **Gather the facts before writing.** `get_account_info` for the company, and whatever intake you have
   (the client's site, their brief, a discovery call). Do not invent positioning to fill a template. A
   department with no real facts yet gets no entry.

3. **Draft one memory document per department.** Keep `<dept>` to a canonical department name:
   `marketing`, `content`, `seo`, `social`, `ppc`, `outbound`, `branding`, `customer_avatar`,
   `customer_journey`, `website_design`, `knowledge_base`, `workflow`, `before_after_grid`, `email`,
   `sales`, `helpdesk`, `production`, `accounting`, `comms`, `coder`, `orchestrator`. Anything else lands
   with department NULL and is hydrated into nothing.

4. **Write them in ONE call:**

   ```
   memory_bulk_create({ entries: [
     { type: "memory", name: "seo",       content: "..." },
     { type: "memory", name: "content",   content: "..." },
     { type: "skill",  name: "discovery-call-prep", content: "<!-- department: sales -->\n..." }
   ] })
   ```

   Each entry takes either `{ type, name }` or an explicit `{ domain }` like `_skill:discovery-call-prep`,
   plus `content`, plus an optional `project_id` for project-scoped entries. Cap is 100 entries per batch.

5. **READ `results[]`. A 200 does not mean every entry landed.** One malformed row refuses the WHOLE batch
   upfront, but per-row write failures — most often a 409 because that domain already exists — come back
   individually with `ok: false` while the rest land. Retry only the `ok: false` rows, and handle a 409 by
   reading the existing document and merging into it with `memory_update`, never by writing past it.

6. **Mirror it locally:** `/hiveku:knowledge pull`.

If the account came in through Hiveku's onboarding flow rather than a manual brief,
`onboarding_write_department_memory({ department, entries })` is the intake-driven alternative — it seeds
one department's skills, rules and identity from the recorded intake.

Everything here is recoverable: `memory_list_versions({ memory_id })` then
`memory_restore_version({ version_id })`, even after a delete.
