---
description: Get oriented on the bound Hiveku account before doing any work.
---

Load the operating context for the account bound to this directory, then summarize it.

1. Confirm which account you are on with `get_account_info`. Never skip this — the answer is what
   tells you whose data you are about to touch.
2. Call `account_context_get` with that account's domain. It returns the persona, brand voice,
   customer avatars, saved memory, skills and rules. **Skipping this is the most common cause of
   output that sounds nothing like the client.**
3. Call `list_departments` to see which departments are active.

Then give the user a short brief: which account, what the business is, what the brand voice is,
and what looks like it needs attention. Keep it to what changes what they would do next.

If `account_context_get` returns little or nothing, say so plainly rather than inventing a persona.
