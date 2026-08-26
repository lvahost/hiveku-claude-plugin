---
description: Persist what you learned/did into the right Hiveku department memory (source of truth).
argument-hint: "[department] [what you learned]"
---
Record a learning to Hiveku so every department stays in sync.

1. Pick the department this memory belongs to. Memory domains are a FREE-FORM label — use the one the
   account already uses: call `memory_list` and reuse an existing `domain` value rather than inventing
   one, or a plain slug like `dev` / `marketing` / `sales` / `seo` / `helpdesk` if none fits.
   Do NOT use `list_departments` for this — it returns the CHAT-agent domains, a different and smaller
   vocabulary, and picking from it will split your memory across two naming schemes.
2. Check for an existing entry to refine: `memory_list({ domain: "<department>" })`.
3. Write it: `memory_create({ type: "memory", name: "<department>", content })` — `content` is concise markdown:
   what you did, what you learned, why it matters, how to apply next time. On a 409 (already exists) use
   `memory_update` instead of duplicating.
The local `memory/<dept>/` files are only a mirror — Hiveku is the source of truth, and persisting here is
what brings the other departments + dashboard agents up to speed.
