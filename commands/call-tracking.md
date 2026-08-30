---
description: "\"Set up call tracking\" / \"which ads make the phone ring?\" / \"get us off CallRail\" / \"is the number swap working?\" - DNI call tracking: setup with a dry run before any purchase, the one-shot swap test, pool health, and the CallRail cutover in the only safe order."
argument-hint: "[setup | test | callrail-cutover | health]"
---
Call tracking: $ARGUMENTS. Follow the **hiveku-phone-agency** skill - load
`references/call-tracking-dni.md` first; the pool model, sizing, consent rules, and the migration
order live there. Several tools here shipped with the 2026-08-29 voice program: a name that does
not resolve means the plugin predates it - `/hiveku:update`, then retry.

**setup**:
1. Current state before anything: `voice_pools_list` and `voice_phone_tracking_config_get` for the
   project. A pool may already exist - setup is idempotent, but the dry run is still how you learn
   what this run would touch.
2. `voice_call_tracking_setup` with `dry_run: true` FIRST, every time. Read the per-step results;
   a `blocked` step names the human action (usually E911).
3. [CONFIRM] the real run - `did_count` is the money field: it buys the shortfall up to that
   target, at most 5 DIDs per run, and every number bought bills monthly until released. Show the
   human the dry-run output, the exact `did_count`, and the area-code choice before the yes.
4. Call handling: [CONFIRM] `voice_pool_update` for where tracked calls forward and how they are
   handled.
5. `voice_swap_test` ONCE - it verifies the number swap on the live page and HOLDS a tracking DID
   for the sticky window while it does; never loop it.
6. Offer the send-back: calls flowing back to the ad platforms as conversions is
   `references/conversion-send-back.md`, and the report lane is `/hiveku:call-report`.

**test**: `voice_swap_test` once, then `voice_call_tracking_diagnose` on whatever it surfaced.

**health**: `voice_call_tracking_diagnose` - read the ORDERED `fix_first` list, not the raw check
array. Then `voice_pools_list` for pool size against traffic, and `voice_call_tracking_outbox`
with `status: 'failed'` first - an empty outbox is ambiguous (nothing was ever enqueued, or
everything uploaded cleanly); disambiguate before concluding anything from it.

**callrail-cutover** - the order is load-bearing:
1. Add the CallRail numbers to `swap_source_numbers` via [CONFIRM]
   `voice_phone_tracking_config_set`, so Hiveku swaps THEIR numbers on the site.
2. Verify the swap on the live pages: `voice_swap_test`, once.
3. Port the numbers - `/hiveku:port-numbers`.
4. Remove the CallRail script LAST, only after Hiveku is proven to be measuring. Never leave both
   scripts measuring the same site beyond the verification window - double-counted calls poison
   the ads data in both systems.

**Report** in this order: what exists now → what the dry run says would change → money spent or
about to be spent (`did_count`, monthly billing) → swap-test result → diagnose `fix_first` →
outbox failures → the next human action.

**What NOT to do.** NEVER run `voice_call_tracking_live_probe` on a schedule or in a loop - it
writes a pool session and holds a DID for the sticky window; on a small pool it starves real
visitors of swap numbers. Never run the real setup without a dry run in the same session. Never
leave CallRail and Hiveku both measuring. Never sum platform-reported and Hiveku-recorded call
conversions.

Finish every session of work the same way: persist notable learnings to department memory - read the department's current document with `memory_list({ domain: "<dept>" })`, append your note to the `content` it returns, and send the WHOLE merged document to `memory_update({ memory_id, content })`, which REPLACES it (sending only the new note destroys everything that department had accumulated); use `memory_create({ type: "memory", name: "<dept>", content })` only when no entry exists, and keep `<dept>` to a canonical department name (see hiveku-orient), and reflect the work in Hiveku PM: `pm_projects_list` to find the project (it filters only by `status`; `project_type` is named in its description but is NOT in its schema, so the proxy drops it and you filter the returned list yourself), or `pm_projects_create({ name, project_type })` where project_type is one of seo | ppc | marketing | website | app_dev, then `pm_tasks_create({ project_id, title })` (the field is `title`, not `name`), `pm_tasks_update` as it moves, `pm_tasks_complete({ id, summary })` when the loop is closed. Reopen a task closed too early with `pm_tasks_uncomplete`, never `pm_tasks_update`. A memory_update that destroyed content is recoverable: `memory_list_versions({ memory_id })` lists the snapshots taken before every PUT or DELETE, and `memory_restore_version({ version_id })` restores one (it works for deleted entries too). Hiveku, not this folder, is the source of truth.
