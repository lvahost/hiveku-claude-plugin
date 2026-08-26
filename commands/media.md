---
description: Create images and AI video for ads, social posts, and pages — brand-aware, registered to the Media Library, ready to attach.
argument-hint: "[what to create, e.g. 'a 9:16 reel clip for the spring promo' or '4 ad images for the roofing campaign']"
---
Create the media$ARGUMENTS. Everything you generate lands in the account's Media Library and attaches
to posts/ads via its asset id — never paste raw URLs into content when an asset id exists.

REUSE FIRST. `marketing_media_list` / `stock_photos_search` before generating — the user's real photos
beat AI for authenticity (products, team, location shots), and generation costs money.

IMAGES — cheap, iterate freely:
- One image: `generate_image({ prompt, ... })` — brand-aware by default, auto-registers a media_asset.
- A SET that must look consistent (ad variations, hero + before/after, carousel):
  `generate_image_set` (up to 10 prompts, one shared brand context). Load `account_context_get` first
  and write all prompts from the same visual language.
- Stock: `stock_photos_search` → `stock_photos_download` (registers to the library).

VIDEO — EXPENSIVE, generate deliberately:
- `marketing_generate_video({ prompt, aspect_ratio })` — ~10s clip, 720p. **ALWAYS call with
  `dry_run: true` first**: it returns `{ allowed, used, limit }` (Premium plan, 20 clips/month). Tell
  the user the remaining quota before spending. Each clip is paid work — one good prompt beats three
  retries; NEVER re-generate a clip that succeeded (the asset is already in the library).
- "Animate this": generate or pick a still, then pass it as `reference_media_asset_id` for
  image-to-video. Keep the motion prompt gentle (subtle camera drift, ambient motion).
- Shape by destination: 9:16 → Stories/Reels/TikTok/Shorts; 16:9 → YouTube/X/LinkedIn/site heroes.
  Duration ceilings at post time: Shorts 60s, Reels 90s, X 140s.
- 429 `video_quota_exhausted` = platform capacity, resets overnight — schedule and move on, don't spin.
- Animated DESIGNS (text/layout/branded cards) are a different lane: `marketing_design_export_mp4`
  renders an existing Creative Studio design — no generation cost. Prefer it for text-heavy promos.

USE THE RESULT:
- Social post: attach via `media_asset_ids` on the post-create call; check the platform's media rules
  first (TikTok posts land as inbox drafts; X posting is Premium-gated).
- Ads: image sets sized per placement; note ad platforms re-crop — keep the subject centered.
- Site: for website projects use `assets_upload` (the S3/CDN lane) — the marketing Media Library and
  website-project assets are SEPARATE stores; download + re-upload when moving between them.
- Close the loop in the PM task (what was created, asset ids, where it was used) + owner update.
