# Reporting and Delivery

## What this covers / when to load this

This is the manual for the moment SEO work stops being analysis and becomes something a client sees or a machine executes: building the monthly report, curating sheet appendices, saving and versioning deliverables, aligning with the scheduled/automated reports that email themselves, and running the SEO task queue including the implement-with-AI rail that turns an audit finding into deployed code. Load it when you are assembling a report or deliverable, when you are about to write into the Sheet Canvas, when a client asks "what did you actually do", or when you are deciding whether a finding becomes a ticket, a recommendation, or a shipped change. The main SKILL.md tells you the arc (baseline, strategy, weekly cadence, monthly report) and the analysis plays that produce numbers. This file assumes the numbers already exist and is about what happens to them. It does not re-teach GSC pulls, rank reads or backlink analysis; get those from `references/rankings-and-search-console.md`, `references/technical-seo.md` and `references/link-building-and-competitors.md`, then come back here to publish.

---

## 1. The four delivery surfaces (know which one you are writing into)

These are four different stores with four different lifetimes. Confusing them is the single most common way to destroy a client's work.

**1. `seo_deliverables` rows.** Durable, per-account, addressed by `slug`, unique on (account, slug). One row per artifact: a baseline audit, a strategy doc, a competitor teardown, a monthly report shell. Tools: `seo_deliverable_list`, `seo_deliverable_get`, `seo_deliverable_save`, `seo_deliverable_update`, `seo_deliverable_delete`. This is the permanent record.

**2. The Sheet Canvas + Report Preview workspace.** THERE IS EXACTLY ONE OF THESE PER ACCOUNT. `seo_sheet_create_tab`, `seo_sheet_add_rows`, `seo_report_add_section`, `seo_report_update_section` and `seo_report_clear` all take a `deliverable_slug` argument, and that argument is a legacy no-op: it selects nothing, it is only echoed back in the response. Every one of those calls reads and writes the same account-level blob (`{ sheets, reports }`) that the dashboard's Sheet tab renders. Two consequences you must internalise before you touch it: sections you add for "this month's report" land in the same list as last month's, and `seo_report_clear` wipes every section in the account regardless of the slug you pass.

**3. `seo_automated_reports` rows.** The scheduled client reports that generate and email themselves on a weekly or monthly cadence, with public share links. Read them with `seo_automated_reports`. The write rail is the `marketing_report_*` family, operating on these same rows: `marketing_report_create` (schedule `weekly | monthly | none`; a marketing report is PUBLIC BY DEFAULT, so create mints the share token and stamps `next_scheduled_at` so the cron actually delivers), `marketing_report_update` (rename, cadence, section list, recipients via `delivery_config`, `is_active`, `is_public`; a schedule change re-stamps `next_scheduled_at`, and `is_public: false` REVOKES a marketing report's link outright), `marketing_report_regenerate` (rebuilds the stored numbers NOW; the public page and the emailed summary render that stored blob verbatim, so regenerate is the only way the numbers change; it emails nobody and never advances the schedule; can take minutes), `marketing_report_send` (REAL MAIL LANDS IN THE CLIENT'S INBOX; two-step confirm, see the edge cases), `marketing_report_share_link` (fetch the public URL; read-only, never mints) and `marketing_report_pdf` (marketing reports only; renders the STORED numbers; 409 until the report has been generated at least once).

**4. PM tasks.** The work record. `pm_tasks_create`, `pm_tasks_update`, `pm_tasks_complete`, and the SEO-scoped read/execute rail: `seo_task_list`, `seo_task_get`, `seo_task_implement`, `seo_task_implement_status`.

Before any of this, orient locally. `hiveku-data/seo/*.json` (`projects.json`, `keywords.json`, `rankings.json`, `backlinks.json`, `audits.json`, `competitors.json`) is a snapshot with a `fetched_at` stamp. Read it to learn the shape of the account for free. Note that there is no local snapshot of deliverables, the workspace, or automated reports, so those always require a live read. Run `account_context_get({ domain: 'seo' })` before you write any client-facing prose: brand voice, persona and account rules change what the executive summary is allowed to claim, and its `instructions` field can carry account-specific reporting constraints.

---

## 2. Decision frameworks

### 2.1 What earns a deliverable, and of what type

A deliverable is a thing the client can be handed and that a future session can find. Create one when the artifact has a name, a date and an audience. Do not create one for an interim analysis; that belongs in a sheet tab or in memory. `deliverable_type` is a free-text VarChar(50) but treat it as a controlled vocabulary or filtering breaks: `audit`, `strategy`, `monthly_report`, `competitor_analysis`, `content_brief`. Check what the account already uses with `seo_deliverable_list({ deliverable_type: 'monthly_report', limit: 50 })` and match it exactly rather than inventing a synonym. `status` is `draft` until the client has seen it, `published` when it has been delivered, `archived` when superseded.

Slug discipline is the whole game, because slug is the identity. Use date-sortable slugs: `seo-monthly-2026-08`, `seo-baseline-2026-08`, `competitor-teardown-2026-q3`. Never put a slug in the title only. Never reuse a slug across months.

### 2.2 Narrative or sheet

Narrative sections (`seo_report_add_section`) answer "so what". Sheets (`seo_sheet_create_tab` / `seo_sheet_add_rows`) answer "prove it". The rule: if a table has more than about 12 rows or more than 5 columns, it is an appendix tab, and the narrative gets the top 3 to 5 rows plus a pointer. A monthly report whose Rankings section is a 200-row markdown table is unread. A report with no appendix is unverifiable. You want both.

### 2.3 The reconciliation rule

Every number in narrative prose must be reproducible from a named tool call that you could re-run and get the same figure. Where a figure is derived (percentage change, blended CTR opportunity), write the arithmetic into the appendix tab so the derivation survives you. If you cannot name the source, the number does not go in the report. This is not pedantry: client reports get forwarded to people who will re-derive your numbers in Looker or GA4, and a figure you cannot defend costs the retainer.

### 2.4 Finding to ticket to shipped: who does the work

Three routes for any accepted recommendation, chosen by blast radius:

- **Recommendation only.** Goes into the deliverable's narrative and `recommendations` array. Use when the fix is outside our control (client's ecommerce platform, a third-party template) or needs a decision we do not own.
- **PM task, human or department executes.** `pm_tasks_create`. Use for anything requiring judgment, new copy, or coordination. This is the default.
- **PM task, implement rail executes.** `seo_task_implement`. Use only for narrow, mechanical, page-scoped code changes on a Hiveku-hosted site: title/meta rewrites, heading structure, schema blocks, internal link insertions, canonical fixes. The rail's end state is code deployed to the client's live site, so the bar is "I could describe the exact diff in one sentence and I would approve it unread". If you cannot, it is a human task.

### 2.5 Sequencing the month

Build the report in this order, which is not the order it is read in:

1. Pull and stage the data into appendix tabs first (Play B). Tabs are cheap and idempotent to review.
2. Write the evidence sections against those tabs (Rankings, Traffic, Authority, Work completed).
3. Write Next Month from the roadmap and the open task queue.
4. Write the Executive Summary last, from the sections you just wrote. Place it first.
5. Confirm the whole thing with the user before flipping the deliverable to `published`.

---

## 3. The plays

### Play A: Build the monthly report

**Chain.**

1. `account_context_get({ domain: 'seo' })`. Read brand voice and any reporting rules.
2. `seo_deliverable_list({ deliverable_type: 'monthly_report', limit: 12 })`. Read out: last month's slug and `summary`. You need continuity ("last month we said X would happen") and you need to not collide on slug.
3. `seo_automated_reports({ project_id })`. Read out: whether an active scheduled report already covers this domain, its `report_type` (`marketing` or `social`), `schedule`, `next_scheduled_at`, `is_active`, and its recipient config. Decision: if an active monthly marketing report already emails this client, your job is to complement it, not duplicate it. Align your ship date to land before `next_scheduled_at`, and reference the scheduled report's share link (`marketing_report_share_link({ report_id })`) rather than restating its sections. Note that this tool ignores the `project_id` you pass and returns the account's rows, so filter by domain yourself when reading.
4. `seo_deliverable_save({ title: 'SEO Monthly Report - August 2026', slug: 'seo-monthly-2026-08', deliverable_type: 'monthly_report', status: 'draft', target_domain, target_keywords, summary })`. **Read out `existed`.** The route is idempotent on slug: if the slug is taken it returns the EXISTING row with `existed: true` and changes nothing. A re-run therefore silently no-ops. If `existed` is true, switch to `seo_deliverable_update({ id, ... })` using the returned `id`.
5. Appendix tabs (Play B), then sections.
6. Sections, in report order, each via `seo_report_add_section({ deliverable_slug, title, content })`. Prefix every title with the report period so it stays findable in the shared workspace list: `"2026-08 Executive Summary"`, `"2026-08 Rankings Movement"`, and so on. This prefix is not cosmetic; see the failure modes.
7. `seo_deliverable_update({ id, summary, recommendations, status: 'published' })` once the user confirms. `recommendations` is an array; put the next-month commitments there in structured form so the next session can read them back without parsing prose.

**Section set and what each one is for.**

- Executive summary: five bullets maximum. Headline metric with its direction, the biggest win, the biggest risk, what we did, what is next.
- Rankings movement: climbers, droppers, striking distance for next month. Positions are lower-is-better and period deltas are signed accordingly; do not flip signs to make a chart look nicer.
- Organic traffic: month over month AND year over year. YoY is what stops a seasonal dip from becoming an apology.
- Authority: link profile delta, notable new and lost links, outreach status.
- Work completed: sourced from completed PM tasks, with a live URL for every shipped item.
- Next month: the roadmap slice with an expected-impact and expected-timeframe note per item.
- Local section, only for clients with locations.

**Closing write.** `memory_update` (or `memory_create` if none exists) the report record: slug, period, headline metrics, what was promised for next month. Then `pm_tasks_complete` the "produce monthly report" task.

### Play B: Appendix tabs

**Chain.** For each appendix:

1. `seo_sheet_create_tab({ deliverable_slug: '<report slug>', name: '2026-08 Rankings', columns: [{ id: 'keyword', name: 'Keyword', type: 'text', width: 220 }, { id: 'pos', name: 'Position', type: 'number' }, { id: 'prev', name: 'Prev', type: 'number' }, { id: 'delta', name: 'Change', type: 'number' }, { id: 'url', name: 'URL', type: 'url' }] })`. Column `type` is one of `text | number | metric | url | tag | status | date`. Column `id` is what row keys must match; if you omit `id` it is derived from `name` lowercased with spaces turned into underscores, which is a silent way to end up with keys you did not expect. Always set `id` explicitly.
2. `seo_sheet_add_rows({ deliverable_slug, tab_name: '2026-08 Rankings', rows: [...] })` for the body. Rows are flat objects keyed by column id (`{ keyword: 'roof repair dallas', pos: 6, prev: 11, delta: -5, url: 'https://...' }`); they are normalised into the canvas row shape for you.

**Critical mechanics.**

- `seo_sheet_create_tab` is replace-by-name. Creating a tab whose name already exists DELETES the existing tab's rows and columns and substitutes yours. Because tab names are the address, a re-run of your report script wipes the previous content of that tab. Date-prefix every tab name so month N never collides with month N-1.
- `seo_sheet_add_rows` is NOT idempotent and it AUTO-CREATES the tab when `tab_name` does not match, inferring columns from the first row. So a typo in `tab_name` does not error; it quietly spawns a junk tab with guessed columns. And a retried call appends the same rows again. Before any retry, decide: re-run `seo_sheet_create_tab` with the full row set (clean replace) rather than calling `add_rows` twice.
- Batch rows. One `seo_sheet_add_rows` call with 300 rows, not 300 calls. The whole workspace blob is read and rewritten on every call, so chatty writes are both slow and a wider window for a concurrent writer to clobber you.

### Play C: Revise a report without destroying the archive

`seo_report_add_section` always APPENDS. It does not dedupe by title. Calling it twice with the same title leaves two sections with identical titles, and `seo_report_update_section` then matches only the first one by exact string, so your edits appear to be ignored while a stale duplicate sits below.

**Chain to revise.** `seo_report_update_section({ deliverable_slug, section_title: '2026-08 Rankings Movement', content: '<new markdown>' })`. Read out: a 404 means no section carries that exact title. Do not respond to a 404 by calling `seo_report_add_section`; first confirm what titles exist (the dashboard workspace Report tab lists them, and it is the only reliable enumeration available from here). `title` is an optional second argument that renames the section while updating it.

**Never call `seo_report_clear` to "start a fresh report".** It empties every report section in the account. If a client has months of sections in the workspace, that is months of work gone in one call. The store snapshots before mutating so the data is recoverable by an engineer from version history, but there is no tool here that restores it, and the client-visible dashboard will show empty in the meantime. Use `seo_report_clear` only when the user has explicitly asked to reset the entire workspace report list and has been told, in that turn, that it is account-wide and not scoped to the slug. Confirm it in words before calling it.

Note also the emptying guard: a write that would leave BOTH zero tabs and zero sections is refused unless destruction was explicitly requested. `seo_report_clear` on an account that still has sheet tabs is NOT caught by that guard. Do not treat the guard as a safety net.

### Play D: Baseline, audit and strategy deliverables

Same skeleton as Play A with different types and a different content contract.

1. `seo_deliverable_save({ title, slug: 'seo-baseline-2026-08', deliverable_type: 'audit', status: 'draft', target_domain, target_keywords: [...], summary, content: {...}, recommendations: [...], tags: ['baseline'] })`. `content` is a free-form JSON object; use it for the machine-readable snapshot (metric values, source tool names, `captured_at`) so a later session can diff against it without re-paying for data. `recommendations` is an array; give each entry a stable shape (`{ id, area, finding, action, effort, impact, status }`).
2. Long tables go to tabs (Play B), not into `content`.
3. `seo_deliverable_get({ id })` to read one back in full including `content` and `recommendations`. `seo_deliverable_list` returns the same fields but paginated, so for a single artifact prefer `seo_deliverable_get`.

Strategy documents are the one place to reach for `talk_to_department({ domain: 'seo', message })`: hand it the cluster matrix, the competitor set, the constraints from `account_context_get`, and ask for the roadmap narrative. Then persist what comes back with `seo_deliverable_save`. Do not let the department agent's prose enter a client report without you reconciling every number in it against a tool call.

### Play E: Triage the SEO task queue

**Chain.**

1. `seo_task_list({ status: 'todo', task_type: 'seo', limit: 100 })`, then repeat with `task_type: 'content'`. `task_type: 'all'` exists but mixing the two families makes triage worse, not better.
2. Read out per row: `status`, `priority`, `page_url`, `pm_project`, `website_project_id`, `implementable`, and the `implement` summary (`dispatched_at`, `approved_at`, `deployment_id`). `implementable` is true only when the status is open (`todo | queued | blocked | need_info`) AND the task's PM project is linked to a website project. A false `implementable` on a task you expected to ship is almost always the missing project link, not the task.
3. `seo_task_get({ task_id })` on anything you intend to act on. Read out `description`, `ai_instructions` and the resolved `page_url`. If `ai_instructions` is thin, the rail will produce a thin change.
4. Decide per task using 2.4. Update statuses honestly with `pm_tasks_update({ id, status, priority })`. A queue where everything is `todo` for six weeks is a queue nobody reads.

**Creating tasks that the rail can see.** `pm_tasks_create({ project_id, title, description, task_type: 'seo', priority, due_date })`. Three traps:

- `task_type` must be `seo` or `content` or `seo_task_list` will never return it under its defaults.
- Do NOT pass `parent_task_id` on a task you want in the SEO queue. The PM create path forces `task_type` to `subtask` whenever a parent is present, which removes the task from the SEO task views entirely. Tasks have been buried three levels deep and invisible for weeks this way. Keep implementable SEO tasks flat.
- There is no argument on `pm_tasks_create` or `pm_tasks_update` for the page anchor. `page_url` is resolved from the task's custom fields or related URL, neither of which is writable from here. Fallback: put the absolute target URL as the first line of `description` and state it again in the title, and tell the user the anchor itself has to be set in the SEO workspace Tasks tab in the dashboard if they want the rail to resolve it automatically.

### Play F: The implement-with-AI rail

This ends with code on the client's live site. Treat every step as a money action.

**Chain.**

1. `seo_task_get({ task_id })`. Confirm `implementable: true`, a sane `page_url`, and that the change is inside the mechanical bar from 2.4.
2. `seo_task_implement({ task_id })` with NO `confirm`. This dispatches nothing. It returns `{ requires_confirm: true, preview }` carrying the task title and description, the target website project name and domain, and the resolved page anchor.
3. Show that preview to the user verbatim and get a yes. Verify the target domain in the preview is the client you think you are working on. A wrong `website_project_id` here means editing someone else's site.
4. `seo_task_implement({ task_id, confirm: true })`. Strict boolean, identical call otherwise. Read out `session_id`. Expect these refusals and do not retry through them: 409 when a session is already running (never double-dispatch, the first one is still burning a paid turn), 409 when the task is already deployed, 409 when the status is not open, 402 when the AI budget or the daily free build limit is exhausted.
5. Poll `seo_task_implement_status({ task_id })`. Phases: `idle`, `running`, `awaiting_approval`, `deploying`, `completed`, `failed`. It performs the same status-sync writes as the dashboard, so it is safe to poll; poll at 30 to 60 second intervals, not tighter.
6. At `awaiting_approval` a production deploy is staged behind the approval rail and the response carries its token, summary and expiry. **Read the staged summary to the user and let them approve it.** The rail is finishable from here - the `agent_approval_` and `agent_inbox_` prefixes are granted to the marketing-seo profile precisely so a profile that can START this rail can FINISH it:
   - `agent_approval_list` shows staged actions awaiting approval (the staged deploy appears with `action: 'deploy_project'`; match it via the `session_id` from `seo_task_implement`). Default shows only approvable rows; `status: 'all'` includes handled and expired history.
   - `agent_approval_get({ token })` inspects one non-destructively - consumed/expired/approvable flags tell "already handled" apart from "still approvable" before you act.
   - `agent_approval_approve` EXECUTES THE STAGED ACTION FOR REAL - `deploy_project` deploys code to the client's live production site. Two-step confirm: the first call (without `confirm`) executes nothing and returns `{ requires_confirm: true, preview }`; show it, get the human's yes, then repeat the IDENTICAL call with `confirm: true` (strict boolean). Tokens are single-use: already-handled 409, expired 410; execution resumes a paid agent turn (402 when billing-gated) and can take minutes.
   - `agent_approval_reject` discards the token without executing anything - no confirm gate, since rejecting only discards.
   The same request also lands in the agent-ops inbox: `agent_inbox_list` / `agent_inbox_get` find it, and `agent_inbox_resolve` closes the queue row AFTER the underlying action is handled (resolving never executes anything). The human's yes on the preview is mandatory - never approve on your own judgment, and never treat "the user asked for the implement" as pre-approval of the deploy. The dashboard's SEO workspace surfaces the same staged action as the fallback. Never describe an unapproved staged deploy as shipped.
7. At `completed` read out `deployed_at` and `deployment_url`. The task auto-completes stamped with the deploy time, so do not also call `pm_tasks_complete` on it. Verify the change on the live URL (`web_scrape` the page and confirm the element you asked for actually changed) before you put it in the Work Completed section.
8. At `failed` read `stage` (`agent` or `deploy`) and the error, then decide: fix the task description and re-dispatch, or reroute to a human task. Do not re-dispatch the identical instructions that just failed.

Close the loop: `memory_create` a line recording what shipped, on what URL, on what date, so the next report's before/after has a real anchor date.

### Play G: Project scope and the two "project" tools that are not the same thing

This trips people constantly. `seo_create_project({ domain, name, description, target_country, target_language })` creates an SEO TRACKING project (a tracked domain, the `project_id` that the rest of the SEO tools consume, listed by `seo_list_projects`). `seo_project_get({ project_id })` and `seo_project_update({ project_id, seo_settings, robots_txt_content, sitemap_settings, seo_monitoring })` operate on a WEBSITE project's site-level SEO configuration, a different id space entirely. Passing an SEO tracking project id to `seo_project_update` does not edit your tracking project; at best it fails, at worst it targets nothing you meant. Confirm which id you are holding before you write. `seo_project_update` is a site-config write (robots.txt content is in there) and therefore always needs explicit confirmation, quoting the exact new value back to the user first.

### Play H: Retire and archive

`seo_deliverable_update({ id, status: 'archived' })` is the correct end-of-life for a superseded artifact. `seo_deliverable_delete({ id })` is permanent and there is no undo tool. Use it only for a genuine mistake created in this session (a typo slug you just made), never to tidy history, and never on anything with a `published` status. Say what you are deleting and get a yes.

---

## 4. Thresholds and benchmarks that trigger action

**Report construction**

- Executive summary: 5 bullets maximum, each under 25 words.
- Narrative table: 12 rows maximum, 5 columns maximum. Over that, it is an appendix tab.
- Report sections per monthly report: 6 to 8. More than 10 and the client skims none of them.
- Appendix tabs per report: 3 to 6. One per evidence family.
- Rows per `seo_sheet_add_rows` call: batch to 200 to 500. Above roughly 2,000 rows in a single tab, sample and state the sampling rule in the tab's first column.

**Workspace health**

- If the account's workspace holds more than ~150 report sections or more than ~25 sheet tabs, stop appending and raise archiving with the user. Accounts have reached 1,400+ sections and a 14 MB blob, at which point every read and every autosave moves the whole thing and the dashboard becomes unusable. There is no archive tool here; the fallback is pruning in the dashboard workspace.

**Task queue**

- Any `implementable` task open more than 30 days: escalate or close. It is not a plan, it is debt.
- More than 20 open `todo` SEO tasks: the queue is not being worked; stop creating and start triaging.
- Implement-rail dispatches per session: keep to 1 to 3. Each is a paid coder turn plus a live deploy, and batching them means several unreviewed diffs land on the site at once.
- `awaiting_approval` older than its stated expiry: the staged deploy is dead. Re-dispatch, do not wait.

**Reporting cadence**

- Monthly report ships within 5 business days of month end. Later than that and the data is stale before it is read.
- Anything the client will read must be confirmed by the user before `status: 'published'`. No exceptions, including "it is just a draft they asked for".

---

## 5. Diagnosis: when the data or the surface looks wrong

**"My report sections do not appear in the client's workspace."** The `deliverable_slug` you passed is a no-op. Sections went into the single account workspace, which is what the dashboard Sheet/Report tab shows. If the dashboard shows nothing at all, you are looking at a different account than the one your API key is bound to. Check with `get_account_info`.

**"`seo_report_update_section` returns 404 on a section I definitely created."** Title match is exact string equality, including the date prefix and any trailing whitespace. Re-read the title from the dashboard and paste it. Also check for the duplicate-title case: if two sections share a title, only the first is ever updated.

**"`seo_deliverable_save` returned but nothing changed."** Read `existed`. A `true` there means the slug already existed and the call was a read, not a write. Switch to `seo_deliverable_update` with the returned `id`.

**"The write 500'd with no obvious reason."** Length limits are enforced at the column: `title` 500 characters, `slug` 200, `deliverable_type` 50, `status` 20. A generated title that includes a long query string will overflow. Truncate before sending.

**"A tab I built last month is empty."** Someone (possibly you, on a re-run) called `seo_sheet_create_tab` with the same `name`. It is replace-by-name. Date-prefix tab names.

**"A tab exists that nobody created."** `seo_sheet_add_rows` auto-creates on an unmatched `tab_name`, and several research tools also auto-file tabs. Accounts accumulate uncurated tabs this way. Do not delete them without asking; some are the client's own.

**"`seo_task_list` returns nothing but I know tasks exist."** Three causes in order of likelihood: the tasks carry `task_type: 'subtask'` because they were created with a `parent_task_id`, so the `seo` default filter excludes them; the status filter you passed excludes them; or they live in a PM project you are not scoping. Retry with `task_type: 'all'` and no status filter before concluding anything.

**"`implementable` is false."** The PM project has no linked website project. That link is not settable from any tool in this set; it is a dashboard action on the PM project. Tell the user exactly that rather than working around it.

**"The implement rail reported success but nothing shipped."** Distrust a bare success. The authoritative signals are `deployed_at` and `deployment_url` from `seo_task_implement_status` with phase `completed`, plus your own verification of the live page. A dispatch that returns without a session id, or a status that sits in `running` for more than about 30 minutes, is a dead turn: report it as failed, do not report it as in progress, and do not silently re-dispatch.

**"`seo_automated_reports` returns rows for other domains."** It filters by account, not by the `project_id` you pass. Filter client-side on the row's domain.

**"An automated report is configured but never arrives."** Check `is_active` and `next_scheduled_at` on the row. A row with a null or past `next_scheduled_at` is not going to fire. Repair with `marketing_report_update({ report_id, is_active: true, schedule })`: a schedule change re-stamps `next_scheduled_at` so the cron re-syncs. While you are on the row, read `delivery_config.recipients`; a report that fires with zero recipients also "never arrives". If the client needs the report today, `marketing_report_send` hand-delivers the current stored numbers through its confirm gate (regenerate first if they are stale).

**Local data looks stale.** `hiveku-data/` files carry `fetched_at`. If it predates recent work, treat it as orientation only and go live. Do not report a number out of a stale snapshot.

---

## 6. Edge cases and failure modes

- **Do not bulk-apply anything.** No loop that calls `seo_task_implement` across a filtered list. No loop that publishes deliverables. Each write is confirmed individually or it does not happen.
- **Do not send or publish silently.** `status: 'published'` and anything that reaches a scheduled report's recipients are client-facing acts. Confirm in the same turn you act.
- **Creating a scheduled report is a public act; sending it is a client-facing send.** `marketing_report_create` works, and a marketing report is PUBLIC BY DEFAULT: create mints a share token anyone holding the URL can open. So confirm the report's existence and its section list with the user before creating, then `marketing_report_regenerate` to populate the numbers before anyone sees the page. "Set it up and email it to the client now" is TWO approvals, not one. Worked example: the user says "create the monthly report and send it to the client" - create it, regenerate it, then STOP: call `marketing_report_send({ report_id })` WITHOUT `confirm`, show the returned preview (report title, the exact recipient list, the public URL that will be mailed) and get a yes on that exact list, then repeat the identical call with `confirm: true` (strict boolean). Do not work around the gate by "test sending" to a real address, and do not pass a `recipients` replacement at confirm time that the user never saw - `recipients` is persisted to `delivery_config` and the mail is real. No preview shown, no send.
- **Do not add a top-level key to the workspace blob.** The workspace round-trips through a coercion that rebuilds `{ sheets, reports }` literally, so any extra top-level key you invent is stripped permanently on the next write by anyone. Extra fields inside a report section or a sheet row survive; extra fields at the top level do not.
- **Do not address workspace content by id.** Multiple id formats coexist and clients re-mint ids that never match the stored row. Address tabs by `name` and sections by `title`, always.
- **Concurrent writers.** The dashboard autosaves the same blob you are writing. If a user has the Sheet tab open while you write, one of you can lose. For any large workspace write, ask the user to close the workspace tab first, or write it in one batched call rather than twenty.
- **Protected and brand assets.** Client-facing copy, brand claims, and anything naming a competitor go through `account_context_get` rules first. If the account context sets an approval threshold or names protected pages, the implement rail is off-limits for those pages regardless of how mechanical the change looks.
- **The report is not the work.** An audit with no tickets is a PDF, not a service. Every accepted finding in a deliverable should have a corresponding entry in `recommendations` AND a PM task, or an explicit note saying why not.
- **Do not paste department-agent prose into a client report unchecked.** `talk_to_department` output is a draft. It will confidently state numbers it did not read.
- **Year-over-year matters.** A month-over-month-only report in a seasonal vertical will eventually require an apology that YoY would have prevented.

---

## 7. Persistence and how the work reaches the client

**Memory.** After each report ships: `memory_list({ domain: "seo" })` to find the existing SEO reporting record, then `memory_update({ memory_id, content })` with that record's returned `content` plus your addition, because the call REPLACES the document (or `memory_create` on first run) with the report slug, the period, three to five headline metrics, what was promised for next month, and any client reaction. Also persist durable decisions: agreed report section set, the client's preferred cadence, which metrics they actually care about, which they have asked you to stop including. The point is that the next session does not re-litigate the format or re-derive the baseline. Search `hiveku_docs_search` / `hiveku_docs_get` before asking the user how a platform surface works.

**PM tasks.** The report itself is a recurring task; `pm_tasks_complete` it when published. Each next-month roadmap item becomes a `pm_tasks_create` with a due date inside the month, so Work Completed writes itself next time. Statuses are updated as reality changes, not at report time.

**Client delivery.** The narrative lives in the workspace Report Preview and the durable artifact lives as a `seo_deliverable_save` row; both are visible in the client's dashboard. If a scheduled report exists (`seo_automated_reports`), the client also receives an emailed report with a public share link, and your job is to make the two agree. If they disagree, the client will believe the email. `marketing_report_regenerate({ report_id, days: 30 })` rebuilds that report's stored numbers (the page and the email render the stored blob verbatim, so regenerate is the only way they change - and it can take minutes, since the marketing assembly includes live Google Ads pulls). `marketing_report_pdf({ report_id })` exports the marketing report as a PDF of those exact stored numbers; it 409s until the report has been generated at least once (regenerate, then retry), and social reports are not supported (share their public link instead).

**Verification before you claim anything.** Anything reported as shipped must have a live URL you have checked (`web_scrape` or `web_extract` on the page, confirming the specific element). Anything reported as a ranking or traffic change must trace to a named tool call. Anything reported as deployed must have a `deployment_url` from `seo_task_implement_status`. Those three rules are what separate a report the client pays for from a report the client audits.
