---
name: outlier-creators
version: 0.1.0
description: Finds small and mid-size creators in a niche whose recent videos far outperform their own usual numbers. Use when the user wants small or mid-size creators in a niche whose recent videos far outperform their own usual numbers. Also for "find outlier creators", "who is blowing up in <niche>", "creators to sponsor for <product>", "find UGC creators before they get big". Niche and platform in, a ranked creators.csv and a top-10 shortlist.md out, with the bill.
---

# Monid outlier creators

A niche or product and a platform go in. A ranked list of creators comes out, each with one recent video that beat that creator's own median by a wide margin, the score, follower count, the video's hook, and a public contact route.

Outlier score = views of the creator's best recent video divided by the median views of their other recent videos. Follower count is only a size filter. It is never part of the score.

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

1. Niche or product. No default. Turn it into one search phrase the way a viewer would type it ("home espresso", not "coffee equipment vertical").
2. Platform. Default TikTok, the only platform verified end to end. Instagram Reels is experimental (see step 6). YouTube Shorts is not supported: its search had no working date filter on 2026-11-22 and no candidate survived the recency rule.
3. Size cap and threshold. Default: at most 250,000 followers, score at least 5x.

## Budget

As of 2026-11-22 a default TikTok run (2 search pages, 12 candidates, 10 profile lookups) was 24 calls and billed $0.0131. Instagram costs about two to three times as much per creator because search carries no follower counts and reels come 12 per page. Default cap: $0.25. State the estimated cost before the first paid call. Stop and ask before going over the cap.

The sampling plan is what keeps cost down: search once, filter for free on what the search already returned, and buy a recent-video list only for the candidates that pass. Do not pull video lists for every author in the search results.

## Steps

Run `monid inspect` on each endpoint before its first run in the session. Prices and fields below are as of 2026-11-22.

1. **Search the niche (TikTok).** tikhub `/api/v1/tiktok/app/v3/fetch_video_search_result`, $0.001 per call. Query params: `keyword`, `count: 20`, `offset: 0`, `sort_type: 0` (relevance), `publish_time: 90` (last three months), `region: "US"`. Run a second page with `offset: 20`. Items are in `search_item_list[].aweme_info`. Keep `aweme_id`, `desc`, `create_time`, `statistics.play_count`, `author.unique_id`, `author.sec_uid`, `author.follower_count`. Dedupe by `aweme_id`, pages overlap.

2. **First filter (no calls).** Drop videos whose author is over the follower cap, videos under 20,000 views, and videos older than 90 days. Keep each author's best video. Rank authors by `views / max(followers, 1000)` and keep the top 12. This ratio is only a way to choose who is worth a paid call. It is not the outlier score.

3. **Pull recent videos, candidates only.** anyapi `/tiktok.profile_videos`, body `{"handle": "<unique_id>"}`, $0.0008 per call on the default route. Returns `data.videos[]`, 20 to 36 per call in the verify run. Keep `id`, `url`, `views`, `createdUtc`, `isPinned`, `caption`, `hashtags`, `paidPartnership`. One call per candidate, no second page.

4. **Score (no calls).** For each candidate:
   - Outlier video: the highest-viewed video posted in the last 90 days whose caption or hashtags are on the niche. On niche means they contain the search phrase or a close variant (for "meal prep": mealprep, mealprepideas, prep for the week). The step-1 search hit does not pass automatically; search relevance is looser than this test, and a creator's biggest video can be an off-topic recipe or lifestyle post that says nothing about your niche.
   - If the step-1 search video is on niche but is not in the returned list (frequent posters push it off the first page), use the search result's views and age for it and write `unknown` in `outlier_pinned`. Do not fetch a second page. Without this, two creators in a test scored 0.7x and 2.9x from a different video where the search hit gave 423.5x and 41.8x.
   - Baseline: the creator's other videos, excluding the outlier video, every pinned video, anything older than 180 days, and anything younger than 2 days (views have not settled).
   - If the baseline videos span fewer than 30 days, say so in `status` ("short window"); a 17-day baseline is a thin picture of the account.
   - Minimum sample: 8 baseline videos. With fewer, write `no baseline` in the status column and leave the score empty. Do not compute a median from a handful of posts.
   - Median, not mean. `score = outlier_views / max(median, 1)`.
   - Pinned videos: never in the baseline, because creators pin their best work and it inflates or distorts the usual level. A pinned video can still be the outlier if it was posted inside the 90-day window. Mark it `outlier_pinned`.
   - Very old videos: never the outlier and never in the baseline. An old hit against a current baseline compares two different accounts.
   - Keep creators at or above the threshold, sort by score.

5. **Contact route, top 10 only.** litescrape `/tiktok/profile`, query `{"handle": "<unique_id>"}`, $0.00015 per call. Keep `user.signature` (the bio), `user.bioLink.link` when present, `stats.followerCount`. Take an email only if it is written in the bio, and a link from `bioLink` or a URL in the bio. Normalize the bio with Unicode NFKC before matching an email. If `bioLink.link` has no scheme, prefix `https://`; if it is not a URL at all, write it as returned and flag it. If the profile lists neither, write "none listed". Do not look the person up anywhere else.

6. **Instagram Reels (experimental).** Same scoring rules, different calls. Each endpoint below ran and returned the stated fields, but it scored 2 creators in one test and 3 in another, at about 3.5 times the TikTok cost per scored creator, so tell the user this route is less proven before spending on it. Write Instagram rows to the same `creators.csv` with `platform` set to instagram and `outlier_pinned` set to `unknown` when the flag is null; a candidate dropped at the follower cap gets `status` "over follower cap".
   - Search: anyapi `/instagram.reels_search`, body `{"query": "<phrase>"}`, $0.00188. Returns `data.reels[]` with `username`, `views`, `createdUtc`, `caption`, `url`. There is no date input and no follower count, so filter to the last 90 days and 20,000 views yourself. Search is relevance-ranked and skews old: expect only 10 to 20 percent of results inside 90 days (2 of 21 and 3 of 14 in a test), so run 2 or 3 phrases before any profile call.
   - Size and contact: anyapi `/instagram.profile`, body `{"handle": "<username>"}`, $0.00056: `followers`, `bio`, `bioLinks`, `externalUrl`. Apply the follower cap here, before the next call.
   - Recent reels: anyapi `/instagram.user_reels`, body `{"handle": "<username>", "route": "kiwi"}`, $0.0012, 12 reels per page. Use this route because it returns `isPinned`; the default route ($0.00095) returns null, and in a test recent pinned reels entered a baseline and moved one score from about 217x to 88x. If you must use the default route, treat leading reels that are older than the reel after them as pinned. If fewer than 8 baseline reels remain, fetch one more page with `cursor` set to `data.nextCursor`. The search hit may not be on the first page; use its views from the search result.

7. **Write the deliverables and the bill.**

## If a step fails

- TikTok recent videos: fallback is tikhub `/api/v1/tiktok/app/v3/fetch_user_post_videos`, query `{"sec_user_id": "<sec_uid>", "count": 30, "max_cursor": 0, "sort_type": 0}`, $0.001. It returned 10 videos per call in the verify run (pinned ones flagged by `is_top`), so the baseline is thinner. Use `sec_uid` from step 1, not the handle.
- litescrape profile returning 503 `service_unavailable`: not billed, retry once.
- anyapi returning `found: false` with reason `not_found`, or a 400 `source_unknown`: retry once with another `route` from the inspect output.
- On `RATE_LIMITED`, wait the stated seconds, then check `monid runs list` before re-running so you do not pay twice.
- Anything else: `monid discover -q "<platform> creator recent videos with view counts"`, then `monid inspect`. Never guess parameters.
- A run can show status `COMPLETED` while the provider call failed. Check `providerResponse.httpStatus` in the run result before using the output.

## Pitfalls

- 4 of the top 10 outlier videos in the verify run were pinned. Skipping the pinned rule changes most of the ranking.
- The default route of `/tiktok.profile_videos` returns `authorFollowers: null`. Take followers from the search result or the profile call.
- A creator's top recent video can be off niche (in the verify run, a food video on a coffee account). Check captions before picking the outlier.
- Bios write emails in styled Unicode letters. A plain regex misses them without NFKC normalization.
- Instagram `user_reels` returns `isPinned: null` on the default route. `route: "kiwi"` ($0.0012) returns it. Without the flag, the 180-day rule removed the pinned reels in the verify run (they were 788 to 1,294 days old), but a recently pinned reel would slip through.
- Search is a sample, not the whole niche. Twenty to forty videos per phrase. For more coverage add a second phrase, not more pages of the first.
- A very high score often means a lifestyle account whose one on-niche video dwarfs its other posts. The score says the niche works on that account, not that the creator delivers it reliably. Say this in the shortlist and point out creators with a high median, who are the steadier bets.
- Capture `monid run -j` from stdout, not `-o`; only stdout carries the run id, provider response and cost. Some providers return `billing.reportedCost` in micro-dollars instead of `cost`; `monid runs get -r <runId> -j` always has `cost`.
- Check the billed cost on each run. A 200 with empty results can still be billed.
- Hooks are the opening line of the caption. This recipe does not transcribe audio.

## Deliverable

- `creators.csv`, one row per scored creator, sorted by score. Columns: `rank, platform, handle, profile_url, followers, outlier_video_url, outlier_views, outlier_age_days, median_views, baseline_videos, outlier_score, outlier_pinned, paid_partnership, hook, contact_email, bio_link, status`. `status` is `outlier`, `below threshold` or `no baseline`.
- `shortlist.md`, the top 10 as a table (creator, followers, median, outlier video link, views, score, contact) followed by one line each on why they fit the user's niche or product: the format of the hit, language or region if it limits fit, and anything that weakens the number (thin baseline, old hit, paid partnership).
- Chat reply: how many videos were searched, how many authors passed the first filter, how many were scored, the top 3 with scores, the thresholds used, and the bill.
- Contact data is limited to what the creator publishes on the profile for business contact. This skill does not write or send outreach. If the user asks for outreach, write drafts to a file and send nothing without their explicit confirmation after they read the drafts.

## Report the bill

Read the cost from each run result (`Cost` in the CLI output, or `monid runs get <runId>`). Do not multiply list prices.

| Endpoint | What it returned | Billed |
|---|---|---|
| tikhub fetch_video_search_result x2 | 40 videos, 36 unique | $0.0020 |
| anyapi tiktok.profile_videos x12 | 20 to 36 recent videos per creator | $0.0096 |
| litescrape tiktok/profile x10 | bio, link, followers | $0.0015 |
| Total | 12 creators scored, 10 with contact routes | $0.0131 |

The table above is the verify run on 2026-11-22. Replace every row with the calls from the current run, including any that returned nothing.
