# Building and Deploying a Hiveku Site

This is the manual behind Play 5 (verify and build), Play 7 (deploy), and Play 10 (secrets) of the
hiveku-web-agency skill. Load it when you are about to run a build, read a build error, decide whether
a failure is real, write a binary into a project, install a package, ship to an environment, or handle
a key. The skill gives the sequence; this gives the mechanics, the ceilings with real numbers, the
three disagreeing copies of the code that produce most false failures, and the incidents behind each
rule. You are operating a paying customer's website. A wrong move here does not fail loudly - it
ships, or it silently does not, and the client finds out first.


## The short list - what actually causes damage

- **Do NOT modify `next.config.*` to fix a build.** The pipeline patches it; your patch fights its
  patch and breaks the preview AND the build.
- **Do NOT edit twice on one symptom without the oracle changing.** A red result citing code you did
  not write is a stale oracle, not a bug. Editing on it wrecks correct code.
- **Do NOT invent a build cache or deflect to "support".** There is no user-facing build cache. That
  is folklore, and folklore is forbidden.
- **Do NOT write a CDN-servable binary into the code lane.** It renders in the preview and is excluded
  from the deploy. Eleven days of AI images went live on a client site that way.
- **Do NOT put a secret in a project file**, and never prefix a server secret with `NEXT_PUBLIC_`.
- **DO run `project_test_build` before believing any verdict**, add a package to `package.json` BEFORE
  writing the import, and dry-run `delete_missing=true` every time.


## 1. next.config - the one file you leave alone

**Rule 1. Never modify `next.config.*` to fix a build failure.** The deployment system automatically
patches the config for production builds: it adds `output: 'standalone'`, `turbopack.root`, and
`typescript.ignoreBuildErrors`. Your changes may conflict with those patches and break both the
preview AND the build. You are not adding a fix; you are adding a second author to the file.

**Rule 2. Only modify next.config for USER-FACING features** - `images.domains`, `redirects`,
`rewrites`, env vars. A user-facing feature is what the visitor
experiences. A build error is not.

**Rule 3. Never add `eslint`, `turbopack`, or `experimental` keys.** These are exactly the surfaces
the deploy patch writes to.

**Rule 4. If a build error mentions `turbopack.root` or "workspace root", it is an infrastructure
issue - say so and stop.** Do not chase it in the config.

Diagnosis: the tell that you are about to break Rule 1 is a build error, no theory, and the config as
the nearest lever. Read the actual error, and confirm the oracle is not stale (section 5).


## 2. Hard build rules - the things that crash a build

**Rule 5. Never `hostname: "**"` in `images.remotePatterns`.** A bare double-wildcard hostname crashes
the build.

**Rule 6. Always `output: "standalone"`.** The deploy patch expects it.

**Rule 7. No `eslint` key on Next 16+.**

**Rule 8. Never a literal `&` in JSX text.** Write `&amp;` - "Licensed &amp; Insured". An unescaped `&`
crashes React builds. The most common crash in hand-written marketing copy, because "Licensed &
Insured" and "Sales & Service" are exactly what every client wants in a hero.

**Rule 9. Avoid smart/curly quotes.** Straight quotes only in code.

**Rule 10. Do not lean on the auto-fixer.** The build auto-fixes hostname wildcards and unescaped `&`
and retries once. A safety net, not a workflow - correct code avoids the retry delay.


## 3. Size ceilings - the real numbers

- Max build source **1.5 GB** - HARD FAIL, error `project_too_large`.
- Lambda source **200 MB** - WARN. Lambda unzipped **250 MB** - platform hard limit.
- Build workspace `/tmp` **2 GB**. Lambda request payload **6 MB**.
- Build heap requires `--max-old-space-size=8192`.

**Rule 11. CDN-servable assets under `public/<subdir>/` do NOT count toward the build source ceiling.**
They are S3-to-S3 copied and never ride the build. This is how you diagnose `project_too_large`. The
incident: Western Stairlifts, 2026-07-09 - **1209 MB of CDN-bypassed assets tripped the ceiling while
the real build source was 332 MB**. The site was nowhere near the limit and could not deploy; the fix
was in the pipeline, not the project. So do not start deleting the client's media. Establish what is
in the build source versus the asset lane.


## 4. Serverless: hard blocks and warnings

Deployed sites run serverless.

**HARD BLOCKS - the project must move to containers, there is no code workaround:**

**Rule 12. PHP** - any `.php` file or a `composer.json`.

**Rule 13. WebSockets and SSE** - `socket.io`, `ws://`, `wss://`, `WebSocket`, `EventSource`. Lambda
functions time out after 15 minutes and cannot maintain WebSocket connections. Reconnect logic does
not save it; the runtime cannot hold the socket.

**WARNINGS - allowed, but design around the constraint:**

**Rule 14. `setInterval`, `while(true)`, in-process cron** - 15-minute max execution. A background
loop here is a loop that dies mid-iteration.

**Rule 15. File uploads via `multer`/`formidable`/multipart** - 6 MB payload cap. Use S3 pre-signed
URLs. An upload larger than that payload cap fails, so route large files to storage with a pre-signed URL instead of through your own route.

**Rule 16. Database: use the pooler `DATABASE_URL` in production, not `DIRECT_URL`.** Lambda
concurrency times direct connections equals connection exhaustion.

**Rule 17. Memory-intensive work** - `sharp`, `jimp`, `canvas`, PDF and video - 10 GB max. Possible,
but size it deliberately.


## 5. THE THREE-COPIES / STALE-ORACLE DOCTRINE

The most important section here. Most "impossible" build failures are not failures. They are a correct
oracle reading a copy of the code you have not written to yet.

### The three copies

```
your workspace  --(background push)-->  the preview CONTAINER's disk  |  the SAVED project
   (what you edit)                        (what the fast checks read)  |  (what deploys)
```

**Rule 18. The background push that copies your edits to the container is best-effort: it has a
2-second timeout and discards its own errors, so IT CAN SILENTLY FAIL. Nothing warns you when it
does.** Internalize this: "I just wrote that file" is never evidence about what a container check saw.

### Which oracle reads which copy

**Availability note.** Of the container-side checks named in this section, `verify_typecheck`, `verify_lint` and `verify_run_tests` are callable from here, and so is `project_test_build`. `verify_build` and `preview_build_check` belong to the Hiveku coding agent's own toolset and are NOT exposed over MCP: treat them as context for how the platform verifies, and reach for `project_test_build` when you need an authoritative verdict. Do not attempt to call them.

**Rule 19. `verify_typecheck`, `verify_lint`, `verify_build`, `preview_build_check` run in the
container against the CONTAINER's disk. They can be minutes behind what you just wrote.**

**Rule 20. `verify_build` is an esbuild parse, not a real build.** Fast, strict about syntax and tag
balance, not a build verdict.

**Rule 21. `preview_runtime_errors` and `preview_logs_*` are a LOG, not a state.** `dev-server.log` is
never rotated, so **a crash from 40 minutes and three fixes ago reads exactly like a fresh one**. Check
its timestamp, and check whether the code it names still exists.

**Rule 22. `project_test_build` reads the SAVED project through the real deploy pipeline. It is slow
(90-180s) and it is the ONLY trustworthy build verdict.** Everything else is a hint.

### Recognizing a stale oracle

**Rule 23. A red result whose cited `file:line` does not match what you just wrote is a STALE ORACLE,
NOT A BUG.**

The procedure:

1. `cat` the cited file.
2. If the quoted text is gone - **do not edit anything.** You would be "fixing" code that is already
   correct, and that is how a codebase gets wrecked.
3. Re-run the check, or escalate to `project_test_build` if you need a verdict now.

Other stale-oracle signatures: the error names a file you deleted or moved this turn; a line number
past the end of the current file; a JSX tag or import you already replaced; a runtime log error whose
stack points at a component that no longer renders.

### The two hard loop rules

**Rule 24. NEVER edit twice on the same symptom without the oracle changing.** If the identical error
came back, either your edit did not reach the oracle or your hypothesis was wrong. Either way, a
second edit is guessing with the customer's code.

**Rule 25. After TWO failed attempts on one symptom, stop editing, run `project_test_build`, and
report what it says.** Not a third edit. A verdict.

**Rule 26. A VARYING ERROR MESSAGE ACROSS ATTEMPTS IS NOT PROGRESS.** The error changed, so it feels
like you moved. What often changed is which stale snapshot the container held, or which pre-existing
error surfaced first. Movement in the message is not movement toward green. Only `project_test_build`
going green is that.

### The two forbidden exits

**Rule 27. NEVER deflect to "support".** You are the operator. There is no queue behind you for a
build error.

**Rule 28. NEVER invent a "build cache". There is no user-facing build cache.** "Try clearing the
build cache", "it's a caching issue", "this happens sometimes" are fabrications. If an error message
you actually received does not say it, you do not say it either.

### Budget

**Rule 29. `project_test_build` is budgeted: 2 starts per turn, and the server refuses beyond 6 per
project per 15 minutes.** Another reason the two-attempts rule exists - burn your builds on
guess-and-check and you have no oracle left when you need one.


## 6. Post-deploy smoke verification

**Rule 30. The pipeline requests the deployed URLs through the CDN and REFUSES to report success when
real routes do not serve.** Shipping artifacts is not serving pages. It catches 403-from-S3,
404-everything, and 5xx, follows redirects, and retries with spacing because the CDN propagates for
minutes.

**Rule 31. A 401 counts as PASS.** An intentional auth gate is a served response. Do not "fix" a
passing gated route.

**Rule 32. `indeterminate: true` means no HTTP response at all** - DNS or edge, nothing answered. WARN,
not fail. Usually propagation, not breakage.

**Rule 33. Page routes under reserved CDN prefixes are excluded from smoke** - they 403 by design, and
counting them would fail every deploy that has one.

**Rule 34. "Deployed, but the live site FAILS verification" means the artifacts shipped and the
SERVING PATH is broken. Run `deploy_doctor`. Do NOT blindly retry the deploy** - a retry re-ships the
same artifacts down the same broken path and costs another propagation window.


## 7. What is excluded from deployment

Never assume a file you can see in the workspace reaches production. Excluded: `node_modules/`,
`.git/`, `.next/`, `.nuxt/`, `dist/`, `build/`, `.pnpm/`, `.yarn/`, `coverage/`, `.cache/`,
`__pycache__/`, `.venv/`, `vendor/`, `.turbo/`, `out/`, `.ai/` (pattern `^\.ai\/`), `.tsbuildinfo`,
and `^extracted-assets/.*\.(txt|md)$`.

**Rule 35. `extracted-assets/*.txt` and `*.md` are excluded because they contain business
intelligence** - import notes that should never be publicly fetchable. **Images under
`extracted-assets/` ARE kept.** Do not "clean up" by moving extracted text into a served directory.

Diagnosis: a page that renders in the preview and 404s or renders empty in production is often reading
a file from one of these paths. The preview has the whole workspace; the deploy does not.


## 8. The code lane vs the asset lane

Two separate storage lanes back a project. Choosing the wrong one is invisible until production.

**Rule 36. A CDN-servable binary stored in the CODE lane RENDERS IN THE LIVE PREVIEW BUT IS EXCLUDED
FROM LAMBDA DEPLOYS.** Upload binaries via the presign asset lane (`project_files_presign` -> PUT ->
`project_files_finalize`) or `assets_upload` instead. This is the most seductive failure mode in the
system, because your verification passes: the preview shows the image, you ship, and it is not there.
Both incidents came from an agent that could see its own work in the preview.

**Incident - Noah's Ark, 2026-06-25:** "the agent wrote AI-generated decoration PNGs into the code lane
at the same paths as the client's real uploads; the site regressed to AI images on every machine
recreate for ELEVEN DAYS." Same paths, so every machine recreate replayed the code lane over the
client's real photographs. Eleven days of a client's site showing AI decoration instead of their own
pictures.

**Incident - 2026-07-28:** "an agent hand-rolled a webp 'optimization' through this writeback path: 111
code-lane image blobs under a self-invented `public/images-webp/`, with 19 sport heroes collapsed to
one duplicated image - a client-visible incident." Nineteen distinct heroes became one, repeated: an
invented directory, an invented conversion, 111 blobs in the wrong lane.

The lesson generalizes past images: **never hand-roll a media pipeline and never create a parallel
converted-asset directory.** If a picture needs to be better, get a larger source.

**Rule 37. `MAX_BINARY_SIZE` is 20 MB.**

**Rule 38. Deleting a CODE file: `rm` works. Deleting a BINARY asset: `rm` is NOT enough** - binary
deletes are deliberately not inferred. Use the asset delete tool, or the asset stays live and you
report a deletion that did not happen.


## 9. Bulk save: caps and the delete_missing protocol

**Rule 39. One save, not N.** Load with `project_files_bulk_get`, make the whole change set, write it
in ONE `project_files_bulk_save`. A stream of single-file saves invites half-applied states and races.

**Rule 40. Caps: 500 files per call, 20 MB combined.** Split by logical change set, never
mid-component.

**Rule 41. A path traversal attempt rejects the WHOLE request** - not the offending file, the request.
One malformed path costs the entire batch.

**Rule 42. Duplicate paths dedupe last-write-wins.** If a path appears twice in a programmatically
built list, only the last lands. Prefer a map keyed by path over an array you append to.

**Rule 43. `delete_missing=true` soft-deletes EVERYTHING not present in `files[]`.** It is a tree
replace, not a merge. It takes an automatic checkpoint first - your recovery, not your permission
slip. The protocol, no steps skipped:

1. **ALWAYS `dry_run` first.** If the removal list surprises you even slightly, your `files[]` is
   incomplete.
2. Run the real call.
3. **Capture `soft_deleted_paths` from the response**, because **deleted paths become invisible to
   `project_files_list`** - afterwards you cannot enumerate what you removed.
4. Verify by reading files and building. Never verify a destructive operation by re-running it.


## 10. package.json discipline

**Rule 44. ALWAYS update `package.json` when you use a new package. If you import a module that is not
in `package.json`, add it as a dependency BEFORE writing the import.**

Mechanism: the preview container auto-runs `npm install` when `package.json` changes - **but only if
you actually update it.** Write the import first and the container installs nothing; you get a
module-not-found that looks like a resolution bug and is a missing dependency. The install is
triggered by the file change, not the import, which is why order is the rule.

Corollary: a large set of packages is pre-installed and must NOT be re-installed (next, react,
react-dom, framer-motion, lucide-react, class-variance-authority, clsx, tailwind-merge, tailwindcss,
postcss, autoprefixer, tailwindcss-animate, @tailwindcss/typography, @radix-ui primitives).


## 11. Deploy tiers and etiquette

Deploy runs `next build` and ships SSR to Lambda behind the CDN, with static assets served from S3.
Client-facing, say "production deployment" and "hosting" - never the provider names.

**Rule 45. `development` is always available and is the default target; `production` is always
available; `staging` is OPT-IN** - `staging_enabled` defaults to false. **Do not offer staging as a
deploy target unless the user tells you they have enabled it.**

**Rule 46. Live Preview is NOT a deployment.** It is a container running `next dev` on ephemeral disk.
Calling a preview "live" is the fastest way to lose a client's trust.

**Rule 47. A build error that does not surface in the live preview can still kill a deploy** -
different bundler, Node baseline, and env injection. Preview-green is not deploy-green.

**Rule 48. Two preview failures are CONTAINER STATE, not code** - do not edit source for either:
**missing images** -> resync assets; **`Module not found: Can't resolve './x'` where the importer is
inside `node_modules/<pkg>/`** -> reinstall dependencies. The giveaway is the importer path: a package
failing to resolve its own relative file is a broken install.

**Rule 49. Commit is not deploy, and neither is silent.** Say what is going live, to which tier, and
why, and get an explicit yes. Log the deploy afterward.

**Rule 50. Files you create or edit THIS TURN reach the live preview only at END of turn. A preview
404 for a route you just created is NORMAL - do not restart the preview.** A mid-turn restart cannot
deliver files that have not synced, and restarts can wedge the preview machine: an orphaned dev-server
holds the port and the whole site times out. That turns a non-problem into an outage.


## 12. Env vars and secrets

**Rule 51. The Hiveku Secrets Manager is the only correct home** - `project_secrets_list` /
`project_secrets_set` / `project_secrets_delete`.

**Rule 52. When the user pastes `.env` content, DO NOT write the values into `.env`, `.env.local`,
`.env.production`, `lib/*.ts`, or any other project file.** Project files get writeback-redacted for
platform secrets, but **THIRD-PARTY KEYS SLIP THROUGH** - the redactor does not know a client's Stripe
or SendGrid pattern. It lands in the project and stays there.

**Rule 53. Never echo a secret value back** - not in chat, a log, a commit message, or a report.

**Rule 54. `NEXT_PUBLIC_*`, `VITE_*`, and `REACT_APP_*` are baked into the CLIENT BUNDLE at BUILD
time.** They are public the moment the site deploys. **Never use the same key for server and client -
use two keys.** Leaking a server secret via `NEXT_PUBLIC_` is the number one way people publish their
own backend keys, and the trap is that it works: the prefix makes the client code run, so the symptom
of the mistake is that the bug goes away.

**Rule 55. If the user pastes the platform `DATABASE_URL` (`postgres://postgres:*@db.*.supabase.co`)
or an `hk_live_*` key - STOP. That is a platform credential**, not theirs to store in a project.

**Rule 56. Reserved secret names a tenant may never store:** `AGENT_SERVER_SECRET`,
`INTERNAL_API_SECRET`, `CLERK_SECRET_KEY`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`AWS_SESSION_TOKEN`, `CRON_SECRET`, `PROXY_API_KEY`, `LITELLM_API_KEY`. A request to set one is
confusion or an impersonation attempt. Refuse and explain.

**Rule 57. Deploy auto-injects `NEXT_PUBLIC_SITE_URL` with the real domain.** Do not set it by hand;
do rely on it for `metadataBase`.


## 13. Verification etiquette

Which check follows which edit:

**Rule 58. `verify_typecheck` after any non-trivial TypeScript edit.**

**Rule 59. Re-check after ANY JSX/TSX structural edit.** From here that means `verify_typecheck`, and `project_test_build` when the change is large enough to be worth the wait. (The platform's own agent runs an esbuild parse at this point, which is stricter about tag balance than a typecheck; that check is not available over MCP, so a structural edit deserves the real build instead.) Not because it is a build, but because
**esbuild is much stricter than `tsc` about tag balance and will catch mismatched `</div>` /
`</section>` / `</Link>` pairs that `tsc` lets through.** Typecheck-green JSX can still be
structurally broken. Highest-yield check when you have been moving markup.

**Rule 60. `verify_run_tests` after structural changes on projects that have tests.**

**Rule 61. Skip the self-check ONLY for pure content edits and trivial typo fixes.** Anything touching
structure, imports, or types gets a check.

**Rule 62. `preview_build_check` runs a REAL `next build` in the container** and catches CSS/PostCSS,
native-module, and config failures `verify_build` cannot see. **But it OVERWRITES the dev server's
`.next` - restart the preview afterward.**

**Rule 63. An empty client-errors result is NOT proof the page is clean - check `capture_installed`.**
Zero errors and zero instrumentation look identical from outside. Generalize it: before treating any
empty result as a clean bill of health, ask what would have had to be working for it to come back
non-empty. An empty result from a check that never ran is not health.

**Rule 64. If the user says they cannot see a change you made, screenshot the EXACT page they are
looking at BEFORE replying. Never tell the user they are mistaken without screenshot evidence in
hand.** They are usually looking at something real: a different environment, a cached response, or a
change saved to a file the site does not serve.

**Rule 65. The diagnostic loop guard. If the error is UNCHANGED after your fix, STOP. Do not re-apply
a similar edit. Your hypothesis was wrong.** A near-identical second edit is the same hypothesis in
different clothing. **If the same error survives roughly 3 distinct attempts, STOP editing and ASK THE
USER. A good question beats a 50-turn spiral.** Asking is not a failure state. The spiral is.


## Diagnosis quick reference

- **Error cites code you did not write** - stale oracle. `cat` it; if the text is gone, edit nothing.
- **Same error after a fix** - hypothesis wrong or the push silently failed. Stop, `project_test_build`.
- **Error message keeps changing** - not progress. Get one real verdict.
- **`turbopack.root` / "workspace root"** - infrastructure. Report it, do not touch the config.
- **`project_too_large`** - suspect CDN-lane assets, not build source (1209 MB vs 332 MB real).
- **Renders in preview, missing in production** - code lane, or an excluded path.
- **Deployed but live verification fails** - serving path, not the build. `deploy_doctor`, no retry.
- **Route 404s in preview this turn** - normal; files sync at end of turn. Do not restart.
- **`Module not found: './x'` from inside `node_modules/<pkg>/`** - reinstall deps. Missing preview
  images - resync assets. For a package you just imported - `package.json` first, which triggers it.
- **Zero client errors** - check `capture_installed` before calling it clean.
- **JSX typechecks but the page is broken** - a typecheck can pass on mismatched tags. Run `project_test_build` for the authoritative answer.

A build is green when `project_test_build` says so. A deploy succeeds when smoke serves the real
routes, not when artifacts upload. A file exists in production when it is in the right lane, not when
it renders in the preview. Each pair has a real customer incident behind the wrong half.
