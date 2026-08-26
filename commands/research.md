---
description: Deep web research for the bound account - competitors, content gaps, prospects.
argument-hint: "[what to research - e.g. 'competitor pricing pages']"
---

Research $ARGUMENTS for the account this directory is bound to. Escalate only as far as you need -
each rung costs more:

1. `web_search({ query, count?, country?, freshness? })` - find candidate URLs / answer a quick question.
2. `web_scrape({ url, formats: ["markdown"] })` - one page's content (the workhorse).
3. `web_map({ url, search? })` - enumerate a whole site's URLs (find every /pricing, /service page).
4. `web_crawl({ url, limit })` - pull many pages of a site at once (competitor content audit).
5. `web_extract({ urls: [...], schema | prompt })` - pull STRUCTURED JSON across many URLs (e.g. {price, plan}
   from every competitor pricing page) - the highest-leverage rung for comparison tables.
6. `web_actions({ url, actions: [...] })` - click/scroll/fill to reach content behind interaction.

First read the account's own positioning with `account_context_get({ domain })` so the research is framed
against this brand, not generic. Persist what you find to department memory (`memory_create`) and, for
SEO/content, feed it into content-gap and keyword work. Cite source URLs in your summary; never fabricate
a finding.
