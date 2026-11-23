---
name: growth-teardown
version: 0.1.0
description: Works out how a company gets its users (search, backlinks, social, ads, community, creators) and returns five plays you can copy. Use when the user wants to know how a company gets its users and which of its moves they can copy. Also for "growth teardown of <company>", "how does <company> get traffic", "reverse engineer <competitor>'s marketing", "what channels work for <company>". Company name or domain in, a playbook (channels, timeline, five copyable plays with evidence links and prompts) plus two CSVs out, with the bill.
---

# Growth teardown

A company name or domain goes in. Out come `playbook.md` (where the attention comes from, a timeline, five plays to copy), `channels.csv`, `top-content.csv`, and the bill.

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

1. Company: a name or a domain. No default, this is the one thing you need. If given only a name, confirm the domain with the user before the first paid call.
2. Market: default United States, English (`location_code` 2840, `language_code` en, Semrush `database` us, ad libraries `US`).
3. Depth: default is one pass per channel. The user can name one channel to go deeper on (see "Depth on request").

## Budget

The verified default run (canva.com, 2026-11-22) billed $0.27 across 33 calls, retries included; a clean pass is 25 calls and about $0.26. Three SEO calls are almost all of it: traffic history $0.12, keywords $0.04, pages $0.03. Default cap: $0.50. State the estimate before the first paid call. Stop and ask before going over the cap. Prices below are as of 2026-11-22; `monid inspect` every endpoint before its first run in a session because prices and schemas change.

## Steps

Save every raw response. Keep a run log with the run id of every call. Label every number you keep as `measured` (a count the endpoint read from the platform or a crawler index) or `estimated` (a modeled SEO figure, a platform's approximate count, or anything you derived from a sample, such as a median or a cadence).

1. Resolve the company. `hunterio /companies/find`, query `domain`. $0.0049 per call. Keep `name`, `foundedYear`, `linkedin.handle`, `fundingRounds` (dates feed the timeline), `metrics.employeesCount`. Expect `foundedYear` and funding to be sparse. Only the LinkedIn handle came back in two runs (as `company/<slug>`; strip the `company/` prefix); every other social handle was null. Resolve the other handles from evidence, in this order: (1) run the YouTube channel call of step 4 first with `about: true`; `channel_results.links` lists the company's other profiles (it returned the TikTok, Instagram, Facebook and LinkedIn URLs in one run); (2) read `igUsername` and `pageAlias` from the verified row of `anyapi /facebook.search_companies` in step 5; (3) only then try the brand name as the handle, and accept it only if step 4 returns `verified: true` and a bio or link pointing at the domain, the company's own short-link domain, or confirmed by another verified profile's links. If the brand-name handle returns 404, do not invent variants (one company's TikTok was `<brand>official`, found through the YouTube links): leave the channel out and say so.

2. Search footprint (4 calls).
   - `dataforseo /labs/historical-bulk-traffic-estimation`, body `targets: [domain]`, `location_code`, `language_code`, `date_from`, `date_to` (24 months, `YYYY-MM-DD`). Listed $0.0012 per result plus $0.12 flat; billed $0.1212 for one domain and 24 months. Keep `metrics.organic[]` (`year`, `month`, `etv`, `count`). `etv` is a modeled traffic value and `count` is ranked keywords: both estimated. Mark months where `etv` moves more than 30% against the prior month; they are timeline candidates.
   - `semrush /domain_organic`, query `domain`, `database`, `display_limit: 20`, `display_sort: tr_desc`. $0.002 per row. Keep `keyword`, `position`, `searchVolume`, `trafficPercent`, `url`. Split brand terms (including misspellings) from non-brand terms and sum `trafficPercent` for each side.
   - `semrush /domain_organic_pages`, same params with `display_limit: 15`. $0.002 per row. Keep `url`, `numberOfKeywords`, `traffic`, `trafficPercent`. Group pages by URL pattern (tool pages, template pages, learn pages); a repeated pattern is a programmatic SEO play.

3. Backlink profile (3 calls).
   - `dataforseo /backlinks/summary`, body `target`. Listed $0.000036 per result plus $0.024 flat; billed $0.00 in the verified run. Keep `backlinks`, `referring_domains`, `referring_links_tld`, `referring_links_attributes` (the `sponsored` count is an affiliate or paid placement signal), `referring_links_platform_types`.
   - `dataforseo /backlinks/history`, body `target`, `date_from`, `date_to`. Billed $0.0249 for 24 monthly rows. Keep per month `backlinks`, `referring_domains`, `new_referring_domains`, `lost_referring_domains`, `referring_links_attributes.sponsored`. Drop broken snapshot rows first (see Pitfalls). Months with a jump are timeline candidates.
   - `dataforseo /backlinks/referring-domains`, body `target`, `limit: 25`, `order_by: ["rank,desc"]`, `internal_list_limit: 1`. Billed $0.0249. Keep `domain`, `rank`, `backlinks`, `first_seen`, `backlinks_spam_score`. Classify each as partner or integration, press, own short link domain, or junk.

4. Owned social (7 calls, about $0.002 in total). For each account compute posts per week and the median engagement over the sample, then list the posts above 10x the median and write what they share (format, hook, collaborator, whether they were boosted). If nothing clears 10x, say so, and say only that: no single post carried the account. It says nothing about how much the channel matters; judge that from the account's size and typical engagement against the other channels. On YouTube, a split between uploads with millions of views and uploads with hundreds or a few thousand is a lead that the big ones were promoted, not proof. Report them under Paid only when step 5 shows video ads for the company; otherwise list them under owned social as "likely promoted, not confirmed".
   - `litescrape /tiktok/profile`, query `handle`. $0.00015. Keep `stats.followerCount`, `stats.videoCount`, `user.verified`, `user.bioLink`.
   - `litescrape /tiktok/profile-videos`, query `handle`, `count: 35`. $0.00015. Keep per item `id`, `desc`, `createTime`, `stats.playCount`, `stats.diggCount`, `isAd`, `isPinnedItem`. Exclude pinned items from cadence. Report `isAd` posts apart from organic ones.
   - `anyapi /instagram.profile`, body `handle`. $0.00056. Keep `followers`, `posts`, `verified`, `bio`, `externalUrl`.
   - `anyapi /instagram.user_posts`, body `handle`. $0.0008. Keep `caption`, `likes`, `comments`, `createdUtc`, `productType`, `paidPartnership`, `url`.
   - `litescrape /youtube/channel`, query `channel_id: "@handle"`, `tab: videos`, `sort: popular`, `about: true`, then one more call with `sort: latest`. $0.00015 each. Keep `channel_results.subscribers`, `total_views`, `video_count`, `joined_date`, and per video `title`, `link`, `extracted_views`, `published_date`.
   - `litescrape /linkedin/company-posts`, query `company` (slug from step 1), `limit: 20`. $0.00015. Keep `text`, `published_at`, `reactions`, `comments`, `url`; the follower count is in `author_subtitle`.

5. Paid (6 calls). Record whether ads run and what they say; none of these libraries report spend.
   - `anyapi /facebook.search_companies`, body `query: brand`. $0.0011. Pick the row with the highest `likes` and `verification: BLUE_VERIFIED`, then confirm it is the company's page before using it: its website, `igUsername` or `pageAlias` must match the confirmed domain or a handle resolved in step 1. Two unrelated verified companies can share a name. If no row can be tied to the company, leave Meta ads out and list them under "not covered". Keep `pageId`. Regional pages come back under the same name.
   - `anyapi /facebook.company_ads`, body `pageId`, `country`, `status: ACTIVE`, `sortBy: impressions`. $0.0011. Keep `totalResults` (active ad count) and per ad `id`, `title`, `text`, `ctaText`, `linkUrl`, `displayFormat`, `startDate`, `platforms`. Dedupe by title plus text, count landing pages, and flag creator-voiced ads (first person copy, partner hashtags).
   - `dataforseo /serp/google-ads-advertisers`, body `keyword`, `location_code`. Listed $0.0012, billed $0.0024. The keyword must be the advertiser's legal name, and no endpoint supplies it reliably (the company lookup's `legalName` is often just the brand). Before the first try, read the bios and recent posts from step 4 for a rename or parent ("part of X", "now X"). Try at most three keywords, in this order: `legalName` if it differs from the brand, the parent or renamed company, then `<Brand> Inc`. A result with only a `type: ads_domain` row and no `advertiser_id` is a miss and is billed; "No Search Results" comes back as 404, not billed. If three tries miss, leave Google ads out and say so. If the advertiser is a parent or a suite, say that `approx_ads_count` covers every brand under it. Keep `advertiser_id`, `approx_ads_count`.
   - `dataforseo /serp/google-ads-search`, body `advertiser_ids: [id]`, `location_code`, `depth: 40`. Listed $0.0012 per page of 40, billed $0.0024. Keep `se_results_count` (approximate, so estimated), and per ad `format`, `first_shown`, `last_shown`, `url`. Count formats; the oldest `first_shown` still showing is a long-running creative.
   - `anyapi /linkedin.ads_search`, body `company: brand`. $0.0012. Keep only rows whose `advertiser` equals the brand; keep `adType`, `headline`, `description`, `url`.
   - `anyapi /tiktok.ad_library_search`, body `query: brand`, `days: 90`, `region` (GB, DE, FR, IT and similar). $0.0008. Count only rows whose `brandName` is the company as its ads, and list rows from partners that sell the product (student discount platforms, resellers) separately, since a partner-paid ad can be the most useful row; keep `adTitle`, `firstShownUtc`, `lastShownUtc`, `estimatedAudience`, `url`.

6. Community and launches (3 calls).
   - `anyapi /reddit.search`, body `query: brand`, `sort: relevance`, `timeframe: year`. $0.00035. Drop posts whose title and body do not contain the brand as a whole word. Keep `title`, `subreddit`, `score`, `numComments`, `createdUtc`, `permalink` (`url` is the outbound link on link posts). Report the share inside the brand's own subreddit and the themes outside it.
   - `anyapi /hackernews.search`, body `query: "\"brand\""` (quoted), `tags: story`. $0.0015. Keep `title`, `points`, `comments`, `createdUtc`, `permalink`, `url`. Stories that link to the company's own domain show which of its own posts travel.
   - Product Hunt has no dedicated endpoint in the catalog. `mrscraper /serp/google`, body `query: "<brand> site:producthunt.com"`. $0.001. Keep the `organic[]` rows whose `link` is on producthunt.com. This proves presence only: it returned no vote counts or launch dates, so say that in the playbook. Zero rows means not shown, not absent; put Product Hunt under "not covered".

7. Creators (2 calls).
   - `anyapi /tiktok.search_keyword`, body `query: brand`, `sortBy: most-liked`, `datePosted: 90`. $0.0012. Drop the company's own handles. Keep `author`, `authorFollowers`, `views`, `likes`, `paidPartnership`, `hashtags`, `caption`, `createdUtc`, `url`. Keep only videos whose caption or hashtags contain the brand. If fewer than 5 remain, re-run once with `sortBy: relevance` (for a brand whose name sits inside a common word, most-liked returned 0 of 30 on brand and relevance 13 of 30). Split disclosed paid (flag true, or the partner hashtag found in step 5) from unpaid, and sum views on each side. Among unpaid creators, note what they sell or link to; that is why they post.
   - `litescrape /youtube/search`, query `q: brand`, `type: video`, `upload_date: this_year`, `sort_by: popularity`. $0.00015. Keep `title`, `link`, `video_id` and the `metadata` array; view count and age are strings inside `metadata` (for example "93M", "5mo ago") and the channel name is usually absent. A video whose id or title matches step 4 is the company's own. The step 4 samples do not hold every company upload, so do not call the rest independent: label a video independent only when the row names a different channel, and "ownership unknown" otherwise.

8. Timeline. No calls. Merge dated evidence into one list, newest last: funding dates (step 1), traffic and backlink months that moved (steps 2 and 3), the oldest ad still showing (step 5), top HN and Reddit posts (step 6), and the launch dates of the outlier posts (steps 4 and 7). Write "approximate" on anything dated only to a month.

9. Five plays. Rank candidate moves by evidence strength (a measured outlier beats an estimated trend) and by whether a small team can repeat them. For each play write: what the company did, the evidence link and its number with the measured or estimated label, how to copy it, and a prompt the user can paste into their agent to do it.

Depth on request (parameters from inspect; not exercised in the verified run): more keywords or pages with a higher `display_limit` (each row bills); the next page of a social feed, ad list or search with the `cursor` or `next_page_token` the response returned (each page bills, pages can overlap, dedupe by id); more Google ads with a higher `depth` (bills per page of 40).

## If a step fails

- `litescrape /google/search` returned 503 in the verified run (not billed); `mrscraper /serp/google` is the route that worked for step 6.
- `anyapi /tiktok.ad_library_search` with `advertiserName` returned 400 `source_unknown` on the default route (billed $0.00); `query` worked.
- `dataforseo /serp/google-ads-search` rejects a call without `advertiser_ids`, even when `target` is set.
- Anything else: `monid discover -q "<capability phrase>"` (for example "instagram user posts by username"), then `monid inspect`. Never guess parameters. Leave a channel out of the playbook, and say so, when no route returns data.
- On `RATE_LIMITED`, wait the stated seconds, and check `monid runs list` before re-running a paid call.
- A run can show status `COMPLETED` while the provider call failed. Check `providerResponse.httpStatus` in the run result before using the output.

## Pitfalls

- Billed cost: `monid run -j` shows it as `billing.reportedCost` in micro dollars for some providers and omits it for others. `monid runs get -r <id> -j` returned `cost.value` for every run; build the bill from that.
- Both Google Ads Transparency endpoints billed $0.0024 against a listed $0.0012. Check the billed cost on each run; a 200 with nothing useful in it can still be billed.
- Google advertiser search matches loosely: for one company the brand name and the domain returned only similarly named businesses and the legal entity name ("<Brand> Pty Ltd") found the right advertiser. For another, the advertiser was registered under a renamed parent company and the brand name returned no advertiser at all.
- A litescrape 503 is not billed; retry once.
- The traffic history reported paid search value of 0 for months in which the Transparency Center listed about 6,000 ads. Do not conclude "no paid search" from that field.
- `dataforseo /backlinks/history` returned two broken monthly rows (138 referring domains between months of about 510,000). Drop rows that fall more than 90% against their neighbours.
- Reddit search with `sort: top` returned 25 posts about "canvas", none about the brand; quoting the word or `title:` did not help. `sort: relevance` returned 25 of 25 on the brand.
- Hacker News search without quotes returned 2 of 30 on the brand; with the quoted word, 30 of 30.
- `litescrape /tiktok/profile-videos` returned a `download_link` to a 748 KB file instead of inline items. Fetch it; the link expires in an hour.
- LinkedIn and TikTok ad searches return other advertisers with similar names, and their `totalAds` and `total` count all matches. Count only rows you filtered to the brand.
- `anyapi /instagram.user_posts` returned 12 posts with `views` null, and `litescrape /linkedin/company-posts` returned 10 posts for `limit: 20`. Cadence from samples this small is estimated.
- Google ad creatives come back without ad copy (format, dates and a preview image only). The words come from the Meta and LinkedIn libraries.
- A `site:` Google query also returned pages from other sites. Filter by host.

## Deliverable

- `playbook.md`: one-paragraph answer to "how do they get users"; a section per channel (search, backlinks, owned social, paid, community and launches, creators) with every number tagged measured or estimated and linked to its source; the approximate timeline; five plays, each with what they did, evidence link, how to copy, and a ready-to-paste prompt; a "not covered" list.
- `channels.csv`: `channel, asset, url, metric, value, measured_or_estimated, source_endpoint, period, note`.
- `top-content.csv`: `channel, owner, author, title_or_text, url, date, metric, value, measured_or_estimated, flags, source_endpoint`. `owner` is own, creator, community, third party or ad.
- Chat reply: the one-paragraph answer, the five plays in a line each, the file paths, what was not covered, and the bill.

Keep creator and poster data to public handles, post links and public counts. Do not collect contact details. This skill sends nothing to anyone.

## Report the bill

End with a table built from `monid runs get`: one row per call, failed and retried calls included.

| # | Endpoint | What it returned | Billed |
|---|----------|------------------|--------|
| 1 | provider /endpoint | rows or the fields used, or the error | $0.0000 |
| | **Total** | calls made | **$0.00** |
