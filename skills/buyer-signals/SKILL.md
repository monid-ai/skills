---
name: buyer-signals
version: 0.1.0
description: A daily brief of fresh buying signals for what you sell: people asking for alternatives, companies hiring for the role, and the week's trigger events. Use when the user wants a daily list of accounts showing fresh buying signals for what they sell. Also for "who should I contact this week", "find people asking for an alternative to <competitor>", "buyer intent brief", "which companies are hiring for <role>". What you sell and to whom in, signals.csv plus brief.md plus seen.json out, with the bill.
---

# Buyer signals brief

In: one sentence on what the user sells and to whom. Out: a short brief of the hottest accounts with one evidence link per signal, a CSV of every signal, and a `seen.json` so the next run reports only new ones.

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

## State & files

State that must survive between runs lives in `${XDG_DATA_HOME:-$HOME/.local/share}/monid/buyer-signals/<brief>/` (create it on first run, written below as `$DEST`): `seen.json` and `signals.csv`. `<brief>` is a short slug of what is sold and to whom (for example `email-tool-small-ecommerce`). Each brief has its own folder, because whether a post is a signal depends on the buyer: an item dropped for one buyer must still be reviewed for another. If the user changes what they sell or who they sell to, start a new brief folder. `brief.md` is written to the current directory.


## Ask first

1. What do you sell, and to whom? Default: what the user already said in this conversation. If nothing, ask this one question.
2. Which competitors and which job titles imply the need? Default: propose 2 or 3 competitor names and 2 or 3 role titles yourself, show them, and proceed.
3. Lookback, size and job market? Default: 14 days, top 10 accounts, US. The longest lookback is 30 days, because the Reddit, Hacker News and LinkedIn searches go back one month; say so if the user asks for more.

## Budget

A default run is 14 calls, or 12 calls and about $0.00735 when the funding step is skipped. The verified run billed $0.00765 (prices as of 2026-11-22). Hiring and Reddit produced most of the kept signals in two test categories; LinkedIn posts cost about half the bill and kept 0 of 21 and 1 of 15 candidates, so offer to drop that step when the user wants the leanest run. Default cap: $0.10. State the estimated cost before the first paid call, and stop and ask before going over the cap. Run `monid inspect` on each endpoint before its first run in a session, because prices and schemas change.

## Steps

1. Build a term sheet from the answers and show it in one short block: topic terms (competitor names, category words), ask terms ("alternative", "switch", "switching", "moving", "migrate", "leaving", "recommend", "looking for", "replace", "which platform", "what do you use"), pain terms ("pricing", "expensive", "price increase", "billing", "banned", "suspended", "acquired", "shut down"), seller terms to exclude ("we built", "I'm building", "our platform", "our plugin", "our tool", "full disclosure", "book a demo", "hiring", "top 10"), role titles, buyer-fit words for job descriptions (for SaaS buyers: "SaaS", "B2B"; for ecommerce buyers: "Shopify", "DTC", "D2C", "ecommerce", "e-commerce"), and one or two funding queries that describe the buyer (not the competitors). The term sheet gets one more pass after the searches: see step 8.

2. Load `$DEST/seen.json` if it exists. It maps signal id to `{first_seen, kept}`.

3. Reddit. `anyapi /reddit.search`, body `{"query": "<competitor> alternative", "timeframe": "month", "sort": "relevance"}`. $0.00035 per call on the default route, 25 posts per page. Run 4 short phrase queries: `<competitor> alternative`, `<competitor> pricing`, `<second competitor> pricing`, `<category> recommendation`. Keep `id`, `title`, `selftext`, `subreddit`, `createdUtc`, `numComments`, `permalink`. Build the evidence link as `https://www.reddit.com` plus `permalink`; `url` is the external article on link posts and can point at another subreddit on crossposts. Do not store `author` or `authorId`. Id: `reddit:<id>`.

4. Hacker News. `search1api /promo/news`, body `{"query": "<competitor or category>", "search_service": "hackernews", "time_range": "month", "max_results": 30}`. $0.0005 per search. Run 3 queries. Keep `title`, `link`, `snippet`, `published_date`, `metadata.num_comments`. Id: `hn:<item id from the link>`.

5. LinkedIn posts. `anyapi /linkedin.search_posts`, body `{"query": "switching from <competitor>", "datePosted": "last-month"}`. Billed $0.002 per call on the default route, about 50 posts. Run 2 queries. Keep `id`, `text`, `url`, `createdUtc`, `reactionCount`. Do not store `authorName`, `authorUrl` or `avatarUrl`. Id: `linkedin:<id>`.

6. Hiring. `litescrape /indeed/search`, query params `{"q": "<role title>", "country": "US", "fromage": <lookback days>, "sort": "date", "limit": 50}`. $0.00015 per call. Run 3 role queries. Keep `job_id`, `title`, `company_name`, `location`, `description`, `posted_at`, `link`. Id: `indeed:<job_id>`. The account is `company_name`.

7. Funding news. Run this step only when the buyer is a venture-backed company type. For small businesses, shops or agencies, skip it and say so in the brief (in a test on small ecommerce stores, 0 of 19 articles were buyers). `litescrape /google/news`, query params `{"q": "<buyer type> startup raises \"Series A\" when:<lookback days>d", "hl": "en-US", "gl": "US", "limit": 40}`. $0.00015 per call. Run 2 queries. Keep `title`, `link`, `published_at`, `source`. Id: `news:<hash of the normalized title>`.

8. Prefilter in code, no extra calls. First scan the titles returned by steps 3 and 4 for a competitor event inside the lookback: several stories about one acquisition, sale, price change, outage or wave of bans. If there is one, add its words to the pain terms, including the other party's name (the acquirer, for example), because headlines say "to acquire" or "agrees to sell" and a term like "acquired" misses them. That event is usually the week's main trigger; name it at the top of the brief. Drop anything older than the lookback (check the item's own date, do not trust the endpoint filter). For posts: require a topic term, require an ask term or a pain term, and drop any post matching a seller term. For Hacker News: the snippet is usually only points and comments, so the ask and pain rule cannot apply; pass a story if the title has a topic term and `metadata.num_comments` is 10 or more, and treat it as an open thread (the buyers are in the comments). For Reddit: a thread whose title has a topic term and an event word, with 10 or more comments, passes without an ask term. For jobs: the title must contain any of the role phrases without its seniority word, whichever query returned it (for "Email Marketing Manager", match "email marketing"), and the description must contain a buyer-fit word from the term sheet. For news: the headline must contain "raises", "raised" or "secures", and must not contain "tracker", "timeline", "list", "guide", "explained" or "this week". Collapse LinkedIn posts that share the same first 80 characters. Dedupe by signal id within this run first (the same job comes back from two role queries, the same post from two phrases), so one item cannot take two of an account's signal slots. Then drop every id already in `seen.json`.

9. Review each remaining candidate by reading it. Keep it only if a buyer is visible: a person asking or complaining about the problem, a company in the stated buyer group hiring the role, or a company in the buyer group that raised money. If a post shows the asker is outside the stated buyer group, drop it; if it does not say, keep it. An event thread passed by step 8 has no single visible buyer; keep it as an open thread of type `event` when the community is one where buyers sit (the competitor's own subreddit, the category subreddit, a platform subreddit, Hacker News) and drop general news communities. Keep one thread per event per community, and of a post crossposted to several subreddits keep the copy with more comments. Drop vendor posts, listicles, job ads posted as LinkedIn posts, wrong senses of a word, roundup articles, and a second article about the same round. Set the type (`asking`, `complaint`, `hiring`, `funding`, `event`), the company if the item names one, and one sentence of why. If a headline does not show buyer fit, drop it and say so. Do not guess.

10. Score each kept signal. Base: asking 5, complaint 4, hiring 4, event 4, funding 3. Add 2 if posted within the last 48 hours, or 1 if within the last 7 days. Add 1 if a Reddit or Hacker News item has 10 or more comments, or a LinkedIn post has 20 or more reactions.

11. Group by company. Account score is the sum of its top 3 signal scores, plus 3 if it has two different signal types. Posts where no company is named are not accounts: list them separately as open threads, ranked by signal score, identified by subreddit or site only.

12. Write the deliverables, then add every reviewed id to `seen.json` (kept and dropped), so a dropped item is not reviewed again tomorrow.

To get this every morning, schedule this skill with your agent's own scheduler. Each run reads `seen.json` and reports only what is new. A repeat run costs the same as the first, because every search is made again; `seen.json` saves review work and repeat reporting, not money.

## If a step fails

- Hacker News: `anyapi /hackernews.search`, body `{"query": "...", "tags": "story"}`, $0.0015. It has no date filter, so filter on `createdUtc` yourself. Or `search1api /news`, which inspect lists as the same endpoint at the regular price of $0.001 (inspected, not run).
- Hiring: `builtin /search_jobs`, query params `{"query": "<role title>", "page": 1}`, $0.01 per call. Returns `company`, `title`, `url`, `posted` (relative text such as "12 Days Ago"). Map `company` to the account, `url` to the link and the id (`builtin:<url>`), and turn `posted` into a date. These ids never match `indeed:` ids, so before review also drop a fallback row whose company and title match a hiring row already in `signals.csv`, or the same vacancy is reported twice. It returns no description, so the buyer-fit check in step 8 cannot run on these rows: keep a row only when the title has the role phrase, mark it "buyer fit not checked" in `why`, and say in the brief that hiring came from the fallback. The fallback was run without a location, so it does not enforce the job market: read `monid inspect` for a location input and use it if there is one; otherwise keep only rows whose returned location is in the requested market, or say in the brief that the market was not enforced.
- Funding news: `search1api /promo/news`, body `{"query": "<buyer type> startup raises Series A", "time_range": "week", "max_results": 30, "language": "en"}`, $0.0005. Returns direct article links.
- Reddit or LinkedIn: retry once, then set `route` to another value from the inspect output. A 400 `source_unknown` is not charged.
- On a 503, wait a few seconds and retry once. Check `monid runs list` before re-running a paid call.
- Anything else: `monid discover -q "<capability phrase>"`, for example "search reddit posts by keyword", then `monid inspect`. Never guess parameters.
- A run can show status `COMPLETED` while the provider call failed. Check `providerResponse.httpStatus` in the run result before using the output.

## Pitfalls

- Reddit with `sort: "new"` and a boolean `OR` / `AND` query returned unrelated posts (fiction, helmets). Short phrase queries with `sort: "relevance"` worked.
- Reddit `timeframe: "week"` left 0 to 5 posts per page after the prefilter. Use `month` and filter by date locally.
- A competitor name that is also a common word pulls the other meaning ("intercom" returned motorcycle headsets). A category word can pull a neighboring market ("helpdesk" returned IT support threads).
- Some Reddit threads that ask "are you switching?" read as vendor-seeded. Keep them as open threads and say so. The buyers are in the replies.
- LinkedIn post search returned mostly vendor content and job ads. In the verified run 0 of 21 prefiltered posts survived review. In a test, a query starting with "looking for" put 36 posts through the ask filter and nearly all were job ads.
- Two identical LinkedIn searches minutes apart returned different posts. Dedupe by id, not by position.
- A LinkedIn query in quotes on route `giraffe` returned `found: false` and was billed $0.
- Indeed with `limit: 50` returned `output.data.download_link` instead of inline JSON. Fetch that link (it expires in one hour) to get `jobs_results`.
- Indeed `fromage` is not strict. A 2024 posting came back under `fromage: 3`. Check `posted_at`.
- `litescrape /indeed/search` and `/google/news` each returned one 503 during testing, billed $0. Other calls to the same endpoints succeeded right after.
- Google News has no date parameter. `when:<N>d` inside `q` works (run with 14). Links are `news.google.com` redirect URLs. The same round appears under several outlets.
- The jobs rule has no company-size check: a large retailer hiring an email manager passed the buyer-fit words for "small stores". If size matters to the user, say in the brief that size was not checked, or drop accounts that are plainly too big.
- A `<competitor> alternative` query can return "alternative" threads for unrelated products (one brand returned music-app threads). The topic-term rule removes them.
- Capture the stdout of `monid run -j -w` to get the run id, cost and provider response. `-o` saves the output only.
- Some run results have no `cost` field. Read `billing.reportedCost.value` (micro dollars) instead.
- A Hacker News search with zero results was billed $0 in this run. Still check the billed cost on each run. A 200 with empty results can be billed.

## Deliverable

- `$DEST/signals.csv`, appended on every run. Columns: `signal_id, first_seen, source, signal_type, account, title, evidence_url, posted_date, engagement, score, why`.
- `brief.md` in the current directory, overwritten on every run: a one-line summary (new signals, named accounts, open threads, candidates reviewed, skipped as already seen, calls, billed total), a "Hottest accounts" table (rank, account, score, signal with date and why, evidence link), an "Open threads" table, and the bill. If nothing is new, it says "No new signals since the last run."
- `$DEST/seen.json`: `{"version": 1, "updated": "<UTC time>", "ids": {"<signal_id>": {"first_seen": "<date>", "kept": true}}}`.
- Chat reply: the top 5 accounts and the top 3 open threads with one evidence link each, the count of new signals and of items skipped as already seen, the file paths, and the bill total.

Print no personal details of individual posters. A company name and a public link are enough. This skill does not contact anyone.

## Report the bill

Read the billed cost from each run result. The verified run on 2026-11-22 (a customer support helpdesk sold to B2B SaaS companies):

| Call | Endpoint | Returned | Passed prefilter (unique) | Billed |
|---|---|---|---|---|
| 4 Reddit searches | anyapi /reddit.search | 100 posts | 8 | $0.00140 |
| 3 Hacker News searches | search1api /promo/news | 25 stories | 0 | $0.00150 |
| 2 LinkedIn post searches | anyapi /linkedin.search_posts | 100 posts | 21 | $0.00400 |
| 3 job searches | litescrape /indeed/search | 120 postings | 6 | $0.00045 |
| 2 funding news searches | litescrape /google/news | 18 articles | 14 | $0.00030 |
| Total | 14 calls | | 49 reviewed, 8 kept (6 named accounts, 2 open threads) | $0.00765 |

A second run minutes later made the same 14 calls for $0.00765, found 52 candidates, skipped 45 as already seen, reviewed 7 and reported 0 new signals.
