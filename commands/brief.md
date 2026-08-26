---
description: Get oriented on the bound Hiveku account before doing any work.
---

Load the operating context for the account bound to this directory, then summarize it.

1. Confirm which account you are on with `get_account_info`. Never skip this — the answer is what
   tells you whose data you are about to touch.
2. Call `account_context_get({ domain })`. `domain` is a DEPARTMENT, not the client's website —
   one of `content` (the default), `marketing`, `seo`, `social`, `ppc`, `sales`, `helpdesk`,
   `branding`, `customer_avatar`, `customer_journey`, `before_after_grid`, `website_design`,
   `knowledge_base`, `workflow`, `outbound`. Anything else is a 400 `invalid_domain`; there is no
   `analytics`, `web` or `commerce` here. Pick the department the session is about. It returns the
   persona, brand voice, customer avatars, saved memory, skills and rules. **Skipping this is the
   most common cause of output that sounds nothing like the client.**
3. Call `list_departments` to see which departments this account is actually entitled to reach.

Then give the user a short brief: which account, what the business is, what the brand voice is,
and what looks like it needs attention. Keep it to what changes what they would do next.

If `account_context_get` returns little or nothing, say so plainly rather than inventing a persona.
A truly empty account needs seeding, not improvisation — point at `/hiveku:seed`.

**For a whole session spent inside one department**, load the heavier bundle instead:
`agent_identity_get({ domain, format: 'markdown' })` returns a fully-assembled CLAUDE.md under
`data.content` — persona, brand guide, account memory, every skill and rule tagged for that domain,
avatars, journeys, KB index, recent content, plus cross-domain memory. Write it to `./CLAUDE.md` and
the session picks all of it up automatically. Ask before overwriting an existing `CLAUDE.md`. Same
15 domains as `account_context_get`; `agent_identity_domains_list` shows which ones this account has
actually configured.
