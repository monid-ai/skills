---
name: competitor-watch
version: 0.1.0
description: A weekly watch report on one to three competitors: site and pricing changes, social posts, open jobs, news, and what customers say. Use when the user wants a weekly watch report on one to three competitors. Also for "what changed on their pricing page", "track my competitors", "competitor weekly digest". Competitor names or domains in, report.md plus site snapshots and changes.csv out, with the bill.
---

# Competitor watch

One to three competitor names or domains go in. A weekly report comes out for each: site changes (pricing page and homepage diffed against saved snapshots), social posts, open jobs, news and funding, customer voice, and three "what this means for you" lines with evidence links.

## Prerequisites

<!-- TEMPLATE:prerequisites.md START -->
### What is monid, and why is it needed?

This skill gets its data through [monid](https://github.com/monid-ai/cli),
a CLI marketplace that routes to data providers (Twitter, LinkedIn,
Google Maps, etc.). It's **pay-as-you-go** — you fund a small balance and
each call costs a fraction of a cent to a few cents. There's no free tier;
without a funded monid key, this skill cannot fetch data.

On first run — or whenever the CLI/key is missing — surface this briefly to
the user, then proceed to setup. Each skill's SKILL.md gives an *estimated*
cost up front; actual cost is reported after each run.

### Install the monid skill

In addition to the CLI, install the upstream **monid skill** — it documents
the full discover → inspect → run workflow and keeps the agent's CLI
knowledge fresh:

```bash
npx skills add https://monid.ai/SKILL.md
```

(Or fetch <https://monid.ai/SKILL.md> directly and save it to your agent's
skills directory. The skill file's frontmatter `version` tracks updates;
re-install when it bumps.)

### Preflight (run at the start of every invocation)

```bash
monid --version || npm install -g @monid-ai/cli
```

If the CLI isn't installed, install it.

Make sure an API key is properly configured and activated (check with
`monid keys list`). If no active key shows up, walk the user through key
setup:

1. Create account → https://app.monid.ai
2. Add funds (pay-as-you-go balance) in the dashboard
3. Generate an API key → https://app.monid.ai/access/api-keys
4. Save it: `monid keys add -k <their-key> -l main`
5. Confirm: `monid keys list`

Verify balance with `monid balance` if you suspect it's empty.

### Agent rules

- Use the **CLI**, never an MCP `monid_run` tool — CLI is the reliable source
  of truth.
- Set `NO_COLOR=1` for clean scripted output.
- The CLI workflow is
  `monid run -p <provider> -e <endpoint> --query '<json>' -i '<json>' --wait <sec> -j -o <file>`.
- If an endpoint's params are ever unclear, run
  `monid inspect -p <provider> -e <endpoint>` first.
- **`-o <file>` strips the API envelope.** Both `monid run -o` and
  `monid runs get -o` write ONLY the `.output` value, not the full response.
  If the API docs show a response shape `{ output: { foo, bar } }`, the saved
  file's top-level keys are `foo` and `bar` — jq paths drop the `.output.`
  prefix. Without `-o` (i.e. stdout + `-j`), the full envelope is preserved.

<!-- TEMPLATE:prerequisites.md END -->

## Ask first

1. Competitors: one to three names or domains. Default: the ones already named in the conversation.
2. What the user sells, in one line. Default: skip it and write the closing lines for a generic rival.
3. Window. Default: the last 7 days, widened to 30 days for any section the week leaves empty.

## Budget

As of 2026-11-22 a first run on one competitor was 17 calls and $0.0178. A later weekly run is 13 calls and about $0.0172. Three competitors is about $0.054. Default cap: $0.25. State the estimated cost before the first paid call, and stop and ask before going over the cap. Check the billed cost on each run; a 200 with empty results can still be billed.

## Steps

Run `monid inspect -p <provider> -e <endpoint>` on each endpoint before its first run in a session. Prices below are as of 2026-11-22. Snapshots and `changes.csv` must survive between runs, so they live in `${XDG_DATA_HOME:-$HOME/.local/share}/monid/competitor-watch/` (create it on first run, written below as `$DEST`). `report.md` is written to the current directory. Repeat steps 1 to 7 per competitor.

1. Snapshot the pricing page and the homepage. `litescrape /web/fetch`, $0.00015 per call, body `{"url": "<url>", "respond_with": "markdown", "retain_images": "none", "engine": "curl"}`. Keep `content`. Guess the pricing URL as `<domain>/pricing`; if it is not a pricing page, find the link in the homepage markdown. Treat a fetch with under 500 characters of `content` as failed. On a first run fetch each page 3 times. On later runs fetch each page once.
2. Compare (no call). Normalize the new fetch and every stored snapshot of that page, then compare whole normalized texts:

   ```python
   import re
   IGNORE_LINES = {'chat with us'}  # widget lines that come and go; add more only when you see them flicker
   def normalize(md):
       out = []
       for line in md.replace('\r', '').split('\n'):
           line = re.sub(r'\]\((https?://[^)\s?#]*)[?#][^)\s]*\)', r'](\1)', line)  # drop ?query and #fragment in links
           line = re.sub(r'!\[[^\]]*\]\([^)]*\)', '', line)                          # drop images
           line = re.sub(r'[ ​‌‍﻿]', ' ', line)             # odd spaces
           line = re.sub(r'\s+', ' ', line).strip()                                  # collapse whitespace
           if line and line.lower() not in IGNORE_LINES: out.append(line)            # drop blank and ignored lines
       return out
   ```

   - No stored snapshot: status `baseline`. Save each distinct version among the 3 fetches as `$DEST/snapshots/<competitor>/<date>-<page>.md`, then `<date>-<page>-v2.md` and so on (whenever a filename already exists, use the next `-vN`). Summarize current pricing (plan, price, unit) in the report and state which billing period the page shows; `curl` returns only the default toggle, so monthly or yearly prices may be missing. More than one version means the site is testing variants; say what differs.
   - The fetch equals the snapshot this page matched on the previous run (the last `compared_to` for this page in `changes.csv`): status `no change`. Write no file.
   - The fetch equals a different stored snapshot: status `known variant`. Write no file, name the snapshot it matched and the one from the previous run, and describe the difference between the two in one line. This is either a site that serves several versions or a page that went back to an earlier version, so report it; do not call it `no change`.
   - The fetch equals none: fetch the same URL 2 more times. If one of the 3 equals a stored snapshot, status `new variant`. If none does, status `changed`. Either way save the new text as a new snapshot, write a line diff against the closest stored snapshot to `<date>-<page>.diff`, read it, and describe what moved in one line (prices, plan names, limits, headline, calls to action).
   - Snapshot files keep the page as fetched. Only the comparison uses normalized text. Append one row per page to `$DEST/changes.csv`.
3. Find the public accounts. `anyapi /google.search`, $0.0005, body `{"query": "<name> <domain> official (site:linkedin.com/company OR site:youtube.com OR site:instagram.com OR site:tiktok.com)"}`. From `data.results[].link` keep the LinkedIn company slug, the YouTube channel id or handle, and the Instagram and TikTok handles. A `youtube.com/c/<name>` or `/user/<name>` link is not a handle: try `@<name>` once and accept it only if the channel title or description in step 4 points at the competitor's domain. If a channel is missing from the results, run one more search for it alone (`"<name>" site:tiktok.com`, $0.0005) before skipping. In the report write "no account found by search", not "no account". Do not guess handles.
4. Social posts. Skip X.
   - LinkedIn: `litescrape /linkedin/company-posts`, $0.00015, query `{"company": "<slug>", "limit": 20}`. Keep `url`, `text`, `published_at`, `reactions`, `comments`, `reposted`.
   - YouTube: `litescrape /youtube/channel`, $0.00015, query `{"channel_id": "<UC id or @handle>", "tab": "videos", "sort": "latest"}`. Keep `videos_results[].title`, `link`, `published_date`, `extracted_views`, and `channel_results.subscribers`.
   - Instagram: `anyapi /instagram.user_posts`, $0.0008, body `{"handle": "<handle>"}`. Keep `data.posts[].url`, `caption`, `createdUtc`, `likes`, `comments`, `username`. Rows are not in date order; sort by `createdUtc`. Count a post as the page's own only when `username` equals the handle (collab posts from bigger accounts would otherwise win "best post").
   - TikTok: `litescrape /tiktok/profile-videos`, $0.00015, query `{"handle": "<handle>", "count": 20}`. The output is `data.download_link`; download it within the hour. Keep `items[].createTime`, `desc`, `stats.playCount`, `stats.diggCount`.
   - Per channel: count posts inside the window, separate the page's own posts from reposts, and name the best post by reactions, likes or views. If the window is empty, say so, give the date of the latest post, and rank the last 30 days instead.
5. Open jobs. Find the careers link in the homepage markdown; if absent, try `<domain>/careers`. Fetch it with `litescrape /web/fetch` ($0.00015, same body without `engine`). Count job links per department heading and note locations and titles that show direction (new regions, AI, security, a new product line). Then `litescrape /linkedin/jobs`, $0.00015, query `{"q": "<name>"}`: read page 1 only (the query does not filter by company, so most rows are other employers), keep only rows where `company` equals the competitor (`title`, `location`, `posted_at`, `link`), and use `posted_at` to see what was opened most recently.
6. News and funding. `context.dev /news/search`, 1 credit ($0.002) per 10 articles, body `{"searchBy": {"type": "entity", "entity": {"type": "domain", "domain": "<domain>"}}, "filterBy": {"date": {"from": <epoch ms 30 days ago>}}, "sortBy": {"type": "relevance"}, "limit": 20}` ($0.004). Keep rows where `match.level` is `primary`. Group by story (many outlets cover one event; `story_id` only groups syndicated copies). Flag titles about funding, acquisitions, layoffs, launches and incidents. If there is no funding news, say so. If no row is `primary`, write "no primary coverage in 30 days" and list up to three secondary stories by title, labelled as passing mentions.
7. Customer voice.
   - Reddit: `anyapi /reddit.search`, $0.00035, body `{"query": "title:<name> (pricing OR price OR alternative OR switched OR switching OR cancel)", "sort": "top", "timeframe": "month"}`. Keep only posts whose title contains the exact name, case-insensitive: Reddit matches near-spellings (one brand pulled 16 of 23 posts about a similarly spelled ordinary word). Keep `title`, `score`, `numComments`, `subreddit`, `permalink`, `selftext`. Rank by `numComments` as well as `score`; the threads with the most comments carry the complaints.
   - Reviews: find the GetApp slug with `anyapi /google.search` ($0.0005, query `site:getapp.com <name> reviews`; the slug is the path such as `collaboration-software/a/<product>`). Then `getapp /get_software_reviews`, $0.01, query `{"slug": "<slug>"}`. Keep `rating_avg`, `total`, `by_field`, `positive_percentage`, and the text of `snippets` of type `cons` with their `created` date. Print the month with each snippet so an old complaint is not read as this week's. Do not print reviewer names.
8. Write three "what this means for you" lines. Each one states a move for the user's product and ends with one evidence link from the steps above. Use three different sections as evidence when possible.

## If a step fails

- CLI shape: a body goes in `-i`, query params in `--query`, for example `monid run -p litescrape -e /web/fetch -i '<body>' -w 120 -j`. Capture stdout for the run id and cost; `-o` writes only the output.
- Page fetch: `context.dev /web/scrape/markdown`, $0.002, query `{"url": "<url>", "maxAgeMs": 0}`; the text is in `markdown`. Never compare a snapshot from one fetcher or engine with a snapshot from another; start a new baseline and say so.
- Reviews: `capterra /search_software` ($0.01, `query`) for `id` and `slug`, then `capterra /get_product_reviews` ($0.01, `product_id`, `product_name`) for the newest review titles and dates.
- Anything else: `monid discover -q "<capability phrase>"` (for example "reddit search posts", "company open job postings", "company news search"), then `monid inspect`. Never guess parameters.
- On `RATE_LIMITED`, wait the stated seconds, and check `monid runs list` before repeating a paid call.
- A run can show status `COMPLETED` while the provider call failed. Check `providerResponse.httpStatus` in the run result before using the output.

## Pitfalls

All observed on 2026-11-22.

- One URL can serve several versions. The homepage came back in two versions across 3 fetches, which is why step 2 compares against every stored snapshot and refetches before calling a change.
- The default engine of `/web/fetch` flipped the pricing page between "per member" and "per seat" wording in 4 fetches; `"engine": "curl"` returned one version in 4 of 4.
- The same page differed by 50 normalized lines between `curl` and the default engine. Keep one engine per page for the life of its snapshots.
- Raw fetches of an unchanged page still differed in 2 lines, a rotating email-protection link fragment. Dropping link fragments removes it.
- The homepage markdown carried no social links, so step 3 is needed.
- `context.dev /news/search` sorted by `newest` returned 10 of 10 passing mentions. Sort by `relevance` and filter on `match.level`.
- A Reddit query without `title:` returned unrelated high-score posts. With `title:` a brand that is a common word still pulls a few; filter them by hand.
- `litescrape /reddit/search` returned 503 (billed $0), and the fields its inspect output lists do not include a score.
- `anyapi /linkedin.jobs` with a `company` filter returned `not_found` (billed $0), and without it returned other employers' jobs for $0.0195.
- `/linkedin/company-posts` returned 9 posts for `limit` 20, and 5 were reposts of other people's posts.
- YouTube dates are relative text such as "12d ago". TikTok results arrive as a download link, not inline.
- `capterra /get_product_reviews` returned empty `pros` and `cons`, and its `rating` field held the product-level rating on every row.

## Deliverable

- `report.md`: one section per competitor with five parts (site changes, social this week, hiring, news and funding, what customers are saying), then "What this means for you" with three lines, each ending in an evidence link, then the bill.
- `$DEST/snapshots/<competitor>/<date>-<page>.md` (page is `pricing` or `homepage`; extra versions get `-v2`, `-v3`), plus `<date>-<page>.diff` when something changed.
- `$DEST/changes.csv`, one row per page per run: `date, competitor, page, url, engine, status, fetches, versions_stored, lines_added, lines_removed, summary, snapshot_files, compared_to, run_ids`. Status is `baseline`, `no change`, `known variant`, `new variant` or `changed`. `compared_to` always holds the snapshot of the text this run's report described: the stored snapshot the first fetch matched, or the new file when the first fetch was saved as `new variant` or `changed` (not the snapshot a retry happened to match). The next run compares with that file, so it never reports `no change` against text the previous report did not describe.
- Chat reply: the site status per page, the top finding per section, the three closing lines, file paths, and the bill.

## Report the bill

End with a table of every call and the total, using the billed cost from each run result (`monid runs get <runId>` shows `cost`).

| Endpoint | What it returned | Billed |
| --- | --- | --- |
| litescrape /web/fetch x6 | pricing and homepage, 3 fetches each | $0.0009 |
| anyapi /google.search | social account links | $0.0005 |
| ... | ... | ... |
| Total | 17 calls | $0.0178 |
