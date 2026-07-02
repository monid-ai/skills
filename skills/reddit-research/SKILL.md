---
name: reddit-research
version: 0.0.1
description: A Reddit go-to-market research associate that tells you where to post, when, and whether an idea has demand. Four modes from public Reddit data — find relevant subreddits, best time to post, a per-subreddit rules/audience report, and idea validation — plus a 30-day warm-up-to-promotion plan. Read-only research; you post from your own account. Use when asked "which subreddits should I target", "where's my audience on Reddit", "best time to post on Reddit", "what are r/X's rules", "validate my idea on Reddit", "30-day reddit plan", or "reddit research".
---

# Reddit Research

An associate for everything you do **before** you post on Reddit: find the right
communities, learn their rules and rhythms, check real demand for your idea, and
turn it into a safe 30-day plan. Everything routes through the `monid` CLI.

## The four modes (+ planner)

| Mode | Answers | Endpoint |
|---|---|---|
| **A. Find subreddits** | where is my audience? | `fetch_dynamic_search` (communities) |
| **B. Best time to post** | when is r/X most active? | `fetch_subreddit_feed` |
| **C. Subreddit report** | what are the rules / what wins here? | `fetch_subreddit_info` + `_style` + `_feed` |
| **D. Idea validation** | is there demand? who are the competitors? | `fetch_dynamic_search` (posts + comments) |
| **Planner** | a safe 30-day roadmap | *(reasoning over A–C; no calls)* |

---

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

---

## State & files

```
${XDG_DATA_HOME:-$HOME/.local/share}/monid/reddit-research/
  profile.json          # product one-liner, target subreddits, timezone
  reports/<sub>.md       # saved subreddit reports
  plan.md                # the current 30-day plan
```

On first run (or missing `profile.json`), ask: **product one-liner**, **target
subreddits** (if known), and **timezone** (for Mode B). Create the dirs with the
`DEST="${XDG_DATA_HOME:-$HOME/.local/share}/monid/reddit-research"; mkdir -p "$DEST/reports"` pattern.

**Cost rule for every mode**: `monid inspect` the endpoint for the live price,
notify the user of the estimate before running, and report summed `cost.value`
after. Never hard-code prices. All endpoints below are per-call and cost a
fraction of a cent.

---

## Mode A — Find subreddits

```bash
NO_COLOR=1 monid run -p tikhub -e /api/v1/reddit/app/fetch_dynamic_search \
  --query '{"query":"<product or niche>","search_type":"community","need_format":true}' \
  --wait 30 -j -o subs.json
jq -c '.. | objects | select(.prefixedName? or (.name? and .subscribersCount?))
       | {name, subscribers: .subscribersCount, desc: .publicDescription}' subs.json
```
Then **rank by fit, not size**: for each candidate rate fit to the product,
promo-friendliness (many subs ban self-promo — flag them), and reachability
(mid-size niche subs usually convert better than giant generic ones).
Recommend a focused 5–8, and warn against blasting the same post everywhere.

## Mode B — Best time to post

Sample a subreddit's recent posts and weight each hour by engagement.
```bash
NO_COLOR=1 monid run -p tikhub -e /api/v1/reddit/app/fetch_subreddit_feed \
  --query '{"subreddit_name":"<sub>","sort":"NEW","need_format":true}' \
  --wait 30 -j -o feed.json
# inspect the shape first if unsure: monid inspect -p tikhub -e /api/v1/reddit/app/fetch_subreddit_feed
jq -c '.. | objects | select(.postTitle? or (.title? and .createdAt?))
       | {createdAt, score, commentCount}' feed.json
```
Bucket posts by **weekday × hour (UTC)**, weight each by
`1 + (score + 3×commentCount)/50`, rank the top buckets, then **convert to the
user's timezone** before advising. Report the top 2–3 windows; if the sample is
small, say confidence is low. Paginate a few pages (follow any `after`/`cursor`
field) for a more reliable histogram.

## Mode C — Subreddit report (pre-posting brief)

```bash
for E in fetch_subreddit_info fetch_subreddit_style; do
  NO_COLOR=1 monid run -p tikhub -e /api/v1/reddit/app/$E \
    --query '{"subreddit_name":"<sub>","need_format":true}' --wait 30 -j -o $E.json
done
NO_COLOR=1 monid run -p tikhub -e /api/v1/reddit/app/fetch_subreddit_feed \
  --query '{"subreddit_name":"<sub>","sort":"TOP","need_format":true}' --wait 30 -j -o top.json
```
Write a brief to `reports/<sub>.md`: **audience & size**, **what wins** (infer
the pattern from the TOP posts — quote 2–3 titles), **rules to respect** (from
`_style`; highlight self-promo / link / account-age limits), and a **go / no-go
on promotion**. If rules didn't load, say so and point the user to the sidebar.

## Mode D — Idea validation

Search how customers describe the *problem* (not your product name), across
posts and comments:
```bash
for T in post comment; do
  NO_COLOR=1 monid run -p tikhub -e /api/v1/reddit/app/fetch_dynamic_search \
    --query "{\"query\":\"<problem phrase>\",\"search_type\":\"$T\",\"sort\":\"RELEVANCE\",\"time_range\":\"year\",\"need_format\":true}" \
    --wait 30 -j -o "val_$T.json"
done
```
Read the real quotes and synthesise an honest verdict: **demand** (how often /
how recent?), **existing solutions** (which competitors get named — happy
users?), **willingness to pay** (any price points / "I'd pay" mentions?), and
the **sharpest unmet need** (your wedge). Give the top 3 quotes with permalinks
as evidence. Report disconfirming signals too; small sample = low confidence.

## Planner — 30-day plan

Combine the modes into a safe ramp and save to `plan.md`:
- **Days 1–7 — warm-up**: genuine comments in target subs (Mode A/C), build
  karma, no promotion. Low-karma accounts get filtered/shadowbanned if they
  promote immediately — this phase is non-negotiable.
- **Days 8–21 — community building**: value-first posts (timed via Mode B),
  become a recognised helpful contributor.
- **Days 22–30 — promotion**: introduce the product only where welcome (Mode C
  go/no-go), softly, in active windows, using the `reddit-monitor` skill to
  catch buying-intent threads.

Personalise every day with the specific subs, timings, and rules from A–C —
never ship the generic template alone.

---

## Guardrails
- Read-only research. This skill finds, analyses, and plans; the human posts,
  from their own account.
- Prefer relevance over reach. Flag no-promo subs plainly; don't help route
  around a community's rules.
- Never suggest managed/aged accounts, vote manipulation, or cross-post spam.

## Reference data: validated endpoints

| Purpose | Provider / Endpoint | Params |
|---|---|---|
| Community / post / comment search | `tikhub /api/v1/reddit/app/fetch_dynamic_search` | `query`, `search_type` (`community`\|`post`\|`comment`), `sort`, `time_range`, `need_format` |
| Subreddit feed (timestamps, top posts) | `tikhub /api/v1/reddit/app/fetch_subreddit_feed` | `subreddit_name`, `sort` (`NEW`\|`TOP`\|`HOT`\|…), `after`, `need_format` |
| Subreddit info (members, category) | `tikhub /api/v1/reddit/app/fetch_subreddit_info` | `subreddit_name`, `need_format` |
| Subreddit rules & style | `tikhub /api/v1/reddit/app/fetch_subreddit_style` | `subreddit_name`, `need_format` |

Response shapes are Reddit-native and can shift; the jq snippets above use
`.. | objects | select(...)` so they survive nesting changes. If a call returns
empty, run `monid inspect -p tikhub -e <endpoint>` and check `monid runs list`
before paying to re-run.
