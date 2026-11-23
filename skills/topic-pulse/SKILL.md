---
name: topic-pulse
version: 0.1.0
description: Reports what people are saying right now about a topic, brand or product across Reddit, TikTok, Instagram, YouTube, Hacker News and news. Use when the user wants to know what people are saying right now about a topic, brand or product across Reddit, TikTok, Instagram, YouTube, Hacker News and news. Also for "what's the buzz on <thing>", "social listening report for <brand>", "what are people saying about <product> this week". Topic and time window in, pulse.md report and posts.csv out, with the bill.
---

# Topic pulse

A topic, brand or product and a time window go in. A report (`pulse.md`) on how big the conversation is per platform, the top posts, the themes with quoted lines and what changed, plus `posts.csv` and the bill, come out.

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

1. **Topic.** Required. From it, build an alias list yourself: the name, its common spellings, its hashtag with no spaces (for example "switch 2", "switch2", #nintendoswitch2). Do not add short generic nicknames (a mascot's first name) as aliases; rely on handle and hashtag matching for those.
2. **Window.** Default: last 7 days. The endpoints only take day, week or month windows, so offer 1, 7 or 30 days.
3. **Platforms.** Default: all six (Reddit, TikTok, Instagram, YouTube, Hacker News, news). No X or Twitter.

## Budget

Prices and numbers here are as of 2026-11-22. A default 7-day run is 16 calls and cost $0.0092 in the verify run ($0.0143 with exploratory extras). Default cap: $0.25. Before the first paid call, tell the user the estimate (about $0.01). Stop and ask before going over the cap. Run `monid inspect -p <provider> -e <endpoint>` on each endpoint before its first run in the session and use the price of the variant labelled `default`; the headline amount is the cheapest route and can be slightly lower than what the default route bills.

## Steps

Set every search to the chosen window before the first call. The step bodies below show the 7-day values; for 1 or 30 days swap them: Reddit `timeframe` day / week / month; TikTok `datePosted` 1 / 7 / 30; YouTube `uploadDate` today / this_week / this_month; Instagram `datePosted` last-day / last-week / last-month; `search1api` `time_range` week / month (read `monid inspect` for the one-day value); Google News `when:<N>d` added to `q`. A local date filter cannot bring back posts the search never returned. Only the 7-day window was run end to end.

Work in two passes. Pass one (steps 1 to 7) is cheap search calls that size the wave. Pass two (step 9) reads comments or a transcript only for the few posts that matter.

1. **Reddit size.** `anyapi /reddit.search`, body `{"query":"\"<topic>\"","sort":"top","timeframe":"week"}` ($0.00035, default route). `timeframe` enum: hour, day, week, month, year, all. Returns 25 posts a page, no page-size input. Keep `title`, `selftext`, `subreddit`, `author`, `score`, `numComments`, `createdUtc`, `permalink`.
2. **TikTok size.** `anyapi /tiktok.search_keyword`, two calls, body `{"query":"<topic>","sortBy":"relevance","datePosted":7,"route":"bison"}` and the same with `"sortBy":"most-liked"` ($0.0006 each on route bison; the default route is $0.0012). `datePosted` takes 0, 1, 7, 30, 90 or 180. Merge the two pages and dedupe by `id`. Keep `caption`, `hashtags`, `author`, `views`, `likes`, `comments`, `shares`, `createdUtc`, `url`.
3. **YouTube size.** `anyapi /youtube.search`, body `{"query":"<topic>","uploadDate":"this_week","sortBy":"popular"}` ($0.00044). `uploadDate` enum: today, this_week, this_month, this_year. Keep `id`, `title`, `channel`, `views`, `publishedTime`, `createdUtc`, `lengthText`, `url`. There are no like or comment counts.
4. **Instagram size.** `anyapi /instagram.search_hashtag`, body `{"hashtag":"<hashtag without #>","datePosted":"last-week"}` ($0.0012). `datePosted` enum: last-hour, last-day, last-week, last-month, last-year. Keep `caption`, `username`, `likes`, `comments`, `createdUtc`, `type`, `url`.
5. **Hacker News size.** `search1api /promo/news`, body `{"query":"<topic>","search_service":"hackernews","time_range":"week","max_results":30}` ($0.0005; without `max_results` the endpoint returns 5). It returns the window's stories with `title`, `link`, `metadata.points`, `metadata.num_comments`. It matches loosely, so filter on the title. The story id is in the `link` (`item?id=<id>`). Do not use `anyapi /hackernews.search` ($0.0015) for the window: it returns the all-time top 30 for the query and misses this week's stories for any well-known topic (for one brand the newest row was 418 days old while a 30-comment story sat in the window). Hacker News has no baseline in this recipe; say so.
6. **News size.** Two calls. `search1api /promo/news`, body `{"query":"<topic>","max_results":30,"time_range":"week","language":"en"}` ($0.0005): direct article links with `title`, `link`, `published_date`. Then `litescrape /google/news`, query params `{"q":"\"<topic>\"","hl":"en-US","gl":"US","limit":50}` ($0.00015): `title`, `source`, `published_at`, used to count distinct outlets and articles per day. Its links are news.google.com redirects, so take links for the report from the first call.
7. **Filter before you count.** On every platform, drop rows outside the window and rows where no alias appears in the title, caption, hashtags or author handle (for Reddit: in the title, or the post sits in a subreddit dedicated to the topic). An alias is not enough on TikTok and Instagram: a row that carries the topic only as a hashtag while its caption is about something else (a stuffed hashtag on an unrelated promo) is `hashtag_only`. Keep it out of the on-topic count and the engagement sums, and report how many there were. Mark rows posted by the topic's own official accounts as `brand_owned`: count them in size, report them separately, and do not pick them for a deep read. Official accounts include regional and sub-brand handles and named staff accounts (the handle contains the brand). One exception: a staff post in a community forum (a subreddit) that is the top post of the week may be read, because its comments are the users' reaction to the week's news. On YouTube, keep a row whose title uses the brand's mascot or product name and whose channel line shows a co-publisher ("and N more"); mark it `brand_owned` only when one of the publishers is an official account of the topic, since two independent creators can co-publish too. For news, also drop reference, quote and evergreen guide pages. Then, per platform, record rows returned, rows on topic, and summed engagement (Reddit score and comments, TikTok views and likes and comments, YouTube views, Instagram likes and comments, Hacker News points, news article and outlet counts). These are first-page samples. Say so in the report; no endpoint here returns a total.
8. **Baseline.** Rerun step 1 with `"timeframe":"month"` and step 3 with `"uploadDate":"this_month"` ($0.00079 together). Keep these monthly samples whole: apply step 7's alias and relevance filters to them but not its window filter. For each, count how many of the on-topic rows fall inside the window. Report the share and stop there: a top list is ranked by score, and older posts have had longer to collect it, so a low share does not show that the peak was earlier and this sample cannot establish a trend. Say that in the report. The one comparison that holds is a recent post beating the month's best. Compare the top engagement number of the month with the top of the window. Use the dates from step 6 for news. If the user asked for a 30-day window, skip this step and say there is no baseline.
9. **Read deep, only where it moved.** From the filtered rows pick at most: 2 Reddit posts, 2 YouTube videos, 1 TikTok video, chosen as follows. Reddit: the highest `score` post, then the highest `score` post on a different storyline (a different subreddit alone is not enough), so two threads about the same event do not use both reads. YouTube: the 2 most viewed creator videos whose title is mainly about the topic (not brand ads, trailers or multi-topic roundups). Titles come back auto-translated, so judge language from the channel name; take a video in the user's language if it has at least 20% of the views of the top qualifying video, otherwise take the top one and translate. TikTok: the most commented video that is not `brand_owned` and whose caption text (not only its hashtags) names the topic and is about it; hashtag-stuffed promos do not qualify. If a video in the user's language has at least half the comments of the top one, take it instead. Skip any post with under 20 comments. YouTube search returns no comment count, so the count is unknown before the call: if fewer than 20 come back, discard them, say so, and do not spend another read to replace it. If a read comes back mostly about something else (the video's subject, not the topic), say that in the report and do not quote it as a theme. If comments come back in another language, translate them and say so in the report.
   - Reddit: `anyapi /reddit.post_comments`, body `{"url":"<post url>"}` ($0.0006). About 200 comments on the first page with `body`, `score`, `parentId`. Sort by `score`.
   - YouTube: `litescrape /youtube/comments`, query params `{"video_id":"<id>","hl":"en"}` ($0.00015). 20 comments a page with `text`, `likes`, `replies`.
   - TikTok: `anyapi /tiktok.video_comments`, body `{"url":"<video url>"}` ($0.0006). 20 comments a page with `text`, `likes`, `replies`. Sort by `likes`.
   - Hacker News, only if a story in the window has 20 or more comments: `anyapi /hackernews.story_comments`, body `{"id":"<story id from the item?id= link in step 5>"}` ($0.0015). Returns `text` and `parentId`, no score.
   - Transcript, at most 1, only for a long on-topic video whose comments show people arguing about its claims: `anyapi /youtube.video_transcript`, body `{"id":"<video id>"}` ($0.001). Returns `transcript` and timed `segments`.
   - Instagram comments are off by default. `anyapi /instagram.post_comments`, body `{"url":"<post url>"}` ($0.0008) works, but see Pitfalls.
10. **Theme.** Label every kept row with one theme: praise, complaint, question, deal, news, how_to, meme, brand_content, other. Use the comments to find the two to four real themes under praise, complaints and questions, and pick one quoted line for each, preferring the most upvoted or liked. Quote the text and its like count. Do not name the commenter.
11. **Write** `posts.csv` and `pulse.md` (see Deliverable), then report the bill.

## If a step fails

- A 503 or a timeout: check the billed cost, wait a minute and retry once. In the verify run the Google News call failed with a 503 (not billed) and worked on the retry.
- Hacker News: `anyapi /hackernews.search`, body `{"query":"<topic>","tags":"story"}` ($0.0015). No date input; filter on `createdUtc` yourself. Useful for older history only.
- Instagram returns fewer than 5 rows inside the window: `anyapi /instagram.hashtag_top_posts`, body `{"hashtag":"<hashtag>"}` ($0.00188), then filter on `createdUtc`.
- Anything else: `monid discover -q "<capability phrase>"`, for example "reddit search posts by keyword" or "youtube video comments", then `monid inspect` the result. Never guess parameters. Never switch to an X or Twitter endpoint.
- If a platform cannot be made to work, leave it out and say so in the report. Do not fill the gap from memory.
- A run can show status `COMPLETED` while the provider call failed. Check `providerResponse.httpStatus` in the run result before using the output.

## Pitfalls

All observed on 2026-11-22.

- Reddit quoted search still returned posts that mention the topic in one line of a post about something else: 25 returned, 15 mentioned it, 6 were about it.
- YouTube `sortBy: popular` put a 3M-view trailer for an unrelated game on top. Filter on the title before choosing what to read.
- TikTok `relevance` returned 18 videos, half of them a few hours old with under 1,200 views; `most-liked` returned the videos that carried the week. Run both.
- Hacker News search returned stories several years old that only share one word with the topic: 30 returned, 18 on topic, 1 in the window. Filter by alias and by date.
- `search1api /promo/news` with `search_service: hackernews` returned 20 stories for the week and 1 was about the topic.
- Google News results included 19 unrelated pages from one site out of 50. Filter on the title.
- Instagram `hashtag_top_posts` has no date input: 0 of 8 rows were inside the 7-day window, the oldest was 304 days old, and `views` was present on 2 of 8.
- Instagram comments came back newest first with 0 or 1 likes each, so they could not be ranked.
- YouTube comment `likes` is text such as "1.9K", and the first row is often the creator's own pinned comment. Convert the number and skip the creator's row.
- YouTube `createdUtc` is derived from "N days ago", so it is accurate to the day at best.
- A Reddit post's `url` can be a reddit.com/gallery link. The comments endpoint accepted it, but use `permalink` for the link in the report.
- `search1api` `published_date` comes as a plain date on some rows and a timestamp on others.
- A wrong Hacker News id returned 200 with `found: false` and billed $0. Copy ids from the search result.
- Reddit `timeframe: week` returned 2 posts that were 7.7 days old. Step 7's window filter removes them.
- For search1api and litescrape the run result can show `cost: null` at completion; read the cost from `runs get` afterwards. `monid run -o` saves only the output, so capture stdout for the run id.
- Check the billed cost on each run. A 200 with empty results can still be billed. Read it from `monid runs get -r <run id> -j` (`cost.value`) or the Cost column of `monid runs list`.

## Deliverable

- `posts.csv`, one row per kept post, columns: `platform, url, author_handle, date, title_or_caption, views, likes_or_score, comments, shares, theme`. Leave a cell blank when the platform does not return that number.
- `pulse.md`, sections in this order: window and aliases; size table (platform, rows returned, on topic, engagement, one-line read); top posts table with links and numbers (up to 3 per platform); themes (praise, complaints, questions, plus any topic-specific theme) each with quoted lines and their like counts; what changed versus baseline, per platform, with the method stated; limits of the run; the bill.
- Chat reply: the loudest platform, the top post, the three main themes in one line each, what changed, the total billed, and the two file paths.
- Commenters are private people. Quote the line, not the handle. Post authors appear as handles in `posts.csv` because the post is the public record being cited.

## Report the bill

End `pulse.md` and the chat reply with a table of every call, including failed ones, and the total:

| Endpoint | What it returned | Billed |
|---|---|---|
| anyapi /reddit.search (week) | 25 posts, 6 on topic | $0.00035 |
| ... one row per call ... | | |
| **Total** | 16 calls | **$0.0092** |

Use the billed cost from each run result, not the list price.
