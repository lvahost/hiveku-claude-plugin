---
description: Oversight digest - who did what on this account from the MCP audit log, writes by key, anomalies, in owner language. Read-only.
argument-hint: "[window - e.g. 'last 7 days' or 'since 2026-08-01']"
---
Oversight digest for the bound account$ARGUMENTS. `audit_query` logs EVERY MCP tool call on this
account - api_key_preview (last 10 chars of the key), tool name, sanitized args summary, status
(success | error | rate_limited), duration, IP, user agent - so this is the one place "what did the
team and the AI actually do here" is answerable. This play reads; its only write is the memory note
at the end. One account per run: the log is tenant-scoped, so a roster review is this command once
per bound folder.

1. **Fix the window.** Default: last 7 days. `audit_query` filters compose with AND, but only
   `since` (ISO 8601, e.g. `2026-08-22T00:00:00Z`) is documented - there is no documented `until`,
   limit, or paging. For a closed window, pull from `since` and cut at the window end yourself. Pull
   TWICE: the window, and the equal-length window before it - the baseline that makes "new" and
   "spike" mean something. If a pull comes back suspiciously round or dense, assume truncation:
   split into shorter `since` slices or per-family `tool_contains` pulls and re-assemble. Never let
   a truncated pull read as a quiet week.
2. **Bucket by actor and family.** Actor = `api_key_preview`. Family = the tool-name prefix before
   the first underscore (`accounting_`, `crm_`, `voice_`, `seo_`...; bucket prefixless tools like
   `get_account_info` and `talk_to_department` as "core"). Two traps:
 - The plugin CLI's own key preview (`hiveku accounts --json`) is the FIRST 10 characters;
     `api_key_preview` is the LAST 10. They are not comparable - never match one against the other.
 - No MCP tool lists this account's keys, so preview → person is not tool-resolvable. Show the
     distinct previews with their call counts, ask the owner to name each once, and persist the
     confirmed mapping to memory (step 6) so the next digest attributes automatically. An unmapped
     preview is "unidentified key", stated as such - never guessed into a name.
3. **Split writes from reads.** Classify by tool-name verb: `list`, `get`, `search`, `query`,
   `summary`, `aging`, `stats`, `history` are reads; everything else counts as a write. Unsure =
   write (fail toward scrutiny). Then pull the high-stakes subsets explicitly so they are complete
   even if the big pull was split: `audit_query({ tool_contains: "delete", since })` (repeat for
   `void`, `purge`, `remove`), and the same for sends (`send`, `reply`, `publish`) and money
   (`payment`, `payroll`, `bill_approve`). Destructive and money rows are quoted row by row - key,
   tool, args summary, when - never summarized away.
4. **Flag anomalies**, each with its numbers beside it:
 - **New tool family**: a family an actor used this window and not in the baseline window. A key
     that read CRM for a month and started calling `accounting_*` is the headline, not a footnote.
 - **Spike**: family call-count several times its baseline. Quote both counts ("312 crm_ calls vs
     40 the week before"), never just "spiked".
 - **After-hours writes**: writes outside the owner's stated business hours. If hours and timezone
     are not already in memory, ask once and persist; until then use a stated default (before 7am /
     after 7pm account-local, plus weekends) and LABEL the definition in the report.
 - **Failure clusters**: `status: "error"` repeats on one tool or one key (something is broken and
     being retried against this client), and `rate_limited` rows (someone is hammering).
5. **Sweep the automations too** - agent work that never touches the audit log's headline families:
   `workflow_runs_recent({ status: "failed", since })`, account-wide across all workflows (default
   window is only the last hour, so pass `since`). Each row carries workflow_name, error_message and
   timing; failed automations join the digest as "what silently stopped".
6. **Write the digest for a non-technical owner.** Lead with plain language: what changed on this
   client, who changed it, what looks unusual - then the tables (per actor: writes / reads /
   destructive / failures; per family: window vs baseline). Every anomaly line carries its counts
   and one example row. Windows that failed to pull are reported "unknown", excluded from any
   denominator, never a silent zero. End with at most three "worth asking about" items - this is an
   oversight report, not an accusation engine: an after-hours write is a question, not a verdict.
7. Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. Hiveku, not this folder, is the source of truth.
