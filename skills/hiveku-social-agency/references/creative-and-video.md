# Creative and media - the asset half of the post

Load this before producing, finding, importing, or attaching any visual asset, and
before spending anything on video. A post is copy plus creative; the creative is often
what stops the scroll.

## Which tool names you can actually see (scoped-key visibility)

The creative surface has TWO naming families, and which one a session can see depends
on the key's profile. The social-scoped key profile grants the `media_`, `gallery_`,
`stock_photos_`, `brand_`, `avatar_` prefixes plus `generate_image` /
`generate_image_set` by name - it does NOT grant `marketing_` or `design_` prefixes.
So on a social-scoped key:
- Library reads/writes use the `media_` names: `media_library_list` (filters:
  media_type, tags, folder_id, collection_id, source_type, ai_generated, search),
  `media_folders_list` (hierarchy + asset count per folder), `media_library_get` (one
  asset by UUID with full metadata + usage_count), and
  `media_library_register_external_url` (register a pre-hosted URL as a media_assets
  row without uploading bytes; `media_library_register_external_url_batch` for a list).
  `media_upload` uploads a file directly (base64 `content`, up to 50MB, one file per
  call).
- The `marketing_media_*` twins (`marketing_media_list`, `marketing_media_folders`,
  `marketing_media_get`, `marketing_media_register_external_url`) are the same library
  through the marketing prefix - real tools, but INVISIBLE to a social-scoped key.
  Use whichever family the session's tool list actually shows; on a full-profile key
  both work.
- The video pipeline (`marketing_storyboard_*`, `marketing_generate_video`,
  `marketing_video_pipeline_status`) and Creative Studio export (`design_export_mp4`)
  are `marketing_`/`design_` prefixed and therefore NOT REACHABLE from a social-scoped
  key at all. If a video lane below is invisible in this session, that is why - route
  the request through the creative department (`talk_to_department({ domain })` toward
  the design/creative agent, or a full-profile session, or `/hiveku:media`), and say
  so rather than improvising.

## Sourcing the asset (in preference order)

- Use existing brand assets first: `media_library_list`, `media_folders_list`, and
  `media_library_get` to find approved photography, logos, and prior graphics.
  Reusing on-brand assets beats generating new ones - it keeps the feed visually
  consistent and respects the brand kit.
- Stock, when the library has nothing: `stock_photos_search` searches Unsplash +
  Pexels and returns { url, thumbnail, photographer, source, attribution }; pull the
  chosen one in with `stock_photos_download`. Keep the attribution when the license
  asks for it.
- Generate original imagery when nothing fits: `generate_image` for a single visual and
  `generate_image_set` for a carousel or a batch of variations to choose from. Prompt
  with the brand's colors, style, and subject from the account's brand context; generic
  stock imagery reads as generic and underperforms. Both charge against the account's
  image quota and auto-register the output as media_assets rows.
- `media_ai_enhance_prompt` turns a rough social post idea into one image-generation
  prompt ready to pass to `generate_image`/`generate_image_set`. It WRITES NOTHING of
  its own, and it COSTS MONEY ON EVERY CALL - it runs a full social department agent
  turn (seconds to tens of seconds, metered against the account's AI spend) - so use
  it for hero posts, not for every thumbnail. A 200 does not prove its anti-repetition
  pass ran; eyeball the prompt against last week's before spending on the image.
- Bring in externally sourced or client-supplied visuals with
  `media_library_register_external_url` so they live in the media library and can be
  attached to posts like any other asset.

## Attaching (the one-shot rule)

Attach the chosen media with `media_urls` on `social_create_post`. That is the ONLY
attach point: `media_urls` is not on `social_update_post`'s schema, so media cannot be
added or swapped after create from any tool here. Have the asset picked before you
create the post; otherwise it is a new post or a dashboard edit.

## Format notes worth respecting

Square or 4:5 for Instagram feed, vertical 9:16 for Reels/TikTok/Stories, landscape or
square for LinkedIn, and a clean landscape/square with legible text for GBP. Carousels
earn saves and dwell time - lean on `generate_image_set` for those.

## Video - three real lanes. Pick one before spending anything.

(All three lanes live behind `marketing_`/`design_` prefixes - see the visibility
section above for what to do when they are not in this session's tool list.)
- MULTI-SCENE Reel/TikTok/promo: `marketing_storyboard_create` (pass exactly one of
  `template_id` + `substitutions`, or a hand-authored `storyboard`). It is FREE and
  fast - it validates, prices, and stores; nothing is billed or enqueued until a human
  approves. THE AGENT CANNOT APPROVE: after
  `marketing_storyboard_submit_for_approval({ storyboard_id })`, report scenes,
  runtime, and cost, then STOP. Do not fan out single clips to work around the gate.
  Track an approved run with `marketing_video_pipeline_status({ pipeline_id })` - same
  id as the storyboard. Full procedure with every trap: `/hiveku:media`. Stock footage
  for a `stock` scene comes from `media_stock_video_search` (Pexels + Pixabay; read
  `providerErrors` on every call; the provider-prefixed `id` like "pexels:13736675" is
  what the scene stores).
- ONE CLIP: `marketing_generate_video({ prompt, aspect_ratio })` - ~10s, 720p, PAID
  (~$1 each), Premium-plan only, 20 clips per account per month. ALWAYS call with
  `dry_run: true` first and tell the user the remaining quota before spending. Animate
  an existing still by passing it as `reference_media_asset_id`.
- MOTION GRAPHICS (text/layout/branded cards, no generation cost): build it in Creative
  Studio and render with `design_export_mp4({ id, canvas_json, width, height,
  duration_seconds })`.

Client-supplied or agency-produced footage still comes in through
`media_library_register_external_url` - that is the import path, not the only video
option. Never claim a clip was generated when it was not.
