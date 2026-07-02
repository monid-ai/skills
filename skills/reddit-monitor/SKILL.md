---
name: reddit-monitor
version: 0.0.1
description: A Reddit engagement associate that finds the timeliest posts to reply to and drafts subreddit-native replies. Monitors your keywords, brand, and competitors, scores each matching post by engagement velocity and opportunity window (rising / golden / anytime), and drafts value-first replies you post from your own account. Read-only — it never posts for you. Use when asked to "monitor Reddit", "find mentions", "find leads on Reddit", "track a keyword / competitor", "find posts to comment on", or "reddit monitor".
---

# Reddit Monitor

An associate that watches Reddit for conversations where your product or
expertise is genuinely relevant, ranks them by **how time-sensitive the
opportunity is**, and drafts a reply that belongs in the community. Everything
routes through the `monid` CLI. It surfaces and drafts; **you** post, from your
own account.

## The two modes

1. **Monitor** (Mode A) — search your keywords, score every matching post by
   engagement velocity, and flag the ones in a `rising` / `golden` window.
2. **Draft** (Mode B) — for a chosen post, pull the thread + top comments and
   draft a value-first reply that fits the subreddit's tone.

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

Per-user state lives under one XDG-standard data root so monid skills don't
collide:

```
${XDG_DATA_HOME:-$HOME/.local/share}/monid/reddit-monitor/
  profile.json                 # product one-liner, keywords, default filters
  digests/YYYY-MM-DD.md        # saved opportunity digests
  last_run.json                # timestamps (drives "what's due")
```

### First-run bootstrap

When `profile.json` is missing or `monid keys list` shows no active key:

1. **Briefly** tell the user what monid is and that it's pay-as-you-go, then proceed.
2. Run the preflight above.
3. `DEST="${XDG_DATA_HOME:-$HOME/.local/share}/monid/reddit-monitor"; mkdir -p "$DEST/digests"`
4. Ask setup questions (below) and write `profile.json`.

### Setup (first run, editable after)

Ask via AskUserQuestion, then write `profile.json`:

1. **Product one-liner** — what it is + the value prop (used to judge relevance).
2. **Keywords** (1–4) — good sets combine: your product name, the main
   competitor's name, and 2–3 pain-point phrases your customers use.
3. **Default window** — `week` (default) / `day` / `month`.

Example `profile.json`:
```json
{
  "product": "GsummyBear — Reddit brand monitoring for B2B SaaS",
  "value_prop": "catch buying-intent threads before they blow up",
  "keywords": ["reddit monitoring tool", "social listening reddit", "gummysearch"],
  "time_range": "week",
  "min_comments": 2
}
```

---

## Mode A — Monitor

### Cost estimate (before each run, dynamic — never hard-code prices)

1. `monid inspect -p tikhub -e /api/v1/reddit/app/fetch_dynamic_search` → read the per-call price.
2. Estimate = `price × number_of_keywords` (one call per keyword).
3. Notify the user: *"Monitoring N keywords, est. ~$X.XX. Starting now."*

### Run (one call per keyword)

```bash
NO_COLOR=1 monid run -p tikhub -e /api/v1/reddit/app/fetch_dynamic_search \
  --query '{"query":"<keyword>","search_type":"post","sort":"RELEVANCE","time_range":"week","need_format":true}' \
  --wait 30 -j -o search.json
```

Extract posts (the `-o` file already dropped the `.output.` prefix):
```bash
jq -c '.search.dynamic.components.main.edges[].node.children[].post
       | {id, postTitle, subreddit: .subreddit.name, author: .authorInfo.name,
          score, commentCount, createdAt, permalink, body: .content.markdown}' search.json
```

> Field names are Reddit-native: `postTitle`, `content.markdown`,
> `authorInfo.name`, `subreddit.name`, `score`, `commentCount`, `createdAt`
> (ISO-8601). The post `id` already carries the `t3_` prefix — reuse it
> verbatim in Mode B.

### Score & classify (deterministic — apply per post)

- `age_hours = (now − createdAt) / 3600`
- `engagement = (score + 3 × commentCount) / max(age_hours, 0.5)`
  (comments weighted 3× — a commentable thread is a better reply target)
- **window**:
  - `rising` — `age_hours < 2` and `commentCount ≥ 1`
  - `golden` — `2 ≤ age_hours ≤ 6` and `commentCount ≥ 2`
  - `anytime` — `age_hours ≤ 72` and `commentCount ≥ 3`
  - else `stale` → drop
- Drop posts below `min_comments`. Sort `rising` → `golden` → `anytime`, then
  by `engagement`.

### Judge relevance (this is why it's an agent, not a cron job)

The score can't know your product. For each surviving post, read `postTitle` +
`body` and rate fit (high / med / low) against `value_prop`. **Drop low-fit.**
Generic keywords pull same-word noise — e.g. "monitor" matches display-hardware
subreddits; only you can tell those from real Reddit-monitoring intent.

### Deliver

A digest to `${XDG_DATA_HOME:-$HOME/.local/share}/monid/reddit-monitor/digests/YYYY-MM-DD.md`:

```markdown
### r/<sub> — <post title>  [window · fit: high]
- ⬆ <score>  💬 <commentCount>  · age <age_hours>h · engagement <n>
- Why relevant: <one line tying it to the product>
- Link: <permalink>
```
Footer: keywords scanned, opportunities found, estimated vs actual spend
(sum `cost.value`).

---

## Mode B — Draft a reply

For a chosen post (from Mode A or a URL the user pastes):

### 1. Pull the thread + top comments (~2 calls)

Get the post `id` (from Mode A, already `t3_…`; or from a URL —
`.../comments/<id>/...` → prefix `t3_`).

```bash
NO_COLOR=1 monid run -p tikhub -e /api/v1/reddit/app/fetch_post_details \
  --query '{"post_id":"t3_<id>","need_format":true}' --wait 30 -j -o post.json
jq '.postsInfoByIds[0] | {postTitle, sub: .subreddit.name, score, commentCount, body: .content.markdown}' post.json

NO_COLOR=1 monid run -p tikhub -e /api/v1/reddit/app/fetch_post_comments \
  --query '{"post_id":"t3_<id>","sort_type":"TOP","need_format":true}' --wait 30 -j -o comments.json
jq -c '.postInfoById.commentForest.trees[].node
       | {author: .authorInfo.name, score, body: .content.markdown}' comments.json
```

### 2. Draft

Write a reply that:
- **answers the poster's question first** — real, specific value before anything else;
- **references a detail** from the post or a top comment (never generic/copy-paste);
- **matches the top comments' tone**;
- **mentions the product at most once**, only if it's genuinely the best answer,
  framed as "I built / I use X for this," not an ad;
- respects link rules — if unsure whether the sub allows links, offer a
  link-free variant.

Offer two variants (soft-mention vs pure-value). Remind the user to post from
their own account and to keep replying if people engage.

### Guardrails
- Read-only. Never post, upvote, or automate on the user's behalf.
- Never suggest vote manipulation, managed/aged accounts, or cross-post spam.
- If a keyword returns only low-fit posts, say "nothing worth engaging" rather
  than manufacturing opportunities.

---

## Cost discipline
- Estimate before (from `monid inspect`), report `cost.value` after. Never
  hard-code prices.
- Mode A = 1 call/keyword; Mode B = ~2 calls/post. Both are fractions of a cent.
- Re-run `monid discover -q "reddit"` occasionally for cheaper/better endpoints;
  default to the validated set below.

## Reference data: validated endpoints

| Purpose | Provider / Endpoint | Pricing | Key params |
|---|---|---|---|
| Keyword search (posts) | `tikhub /api/v1/reddit/app/fetch_dynamic_search` | per-call | `query`, `search_type=post`, `sort`, `time_range`, `need_format` |
| Post details | `tikhub /api/v1/reddit/app/fetch_post_details` | per-call | `post_id` (t3_), `need_format` |
| Post comments | `tikhub /api/v1/reddit/app/fetch_post_comments` | per-call | `post_id` (t3_), `sort_type`, `need_format` |
| Heavier full-scrape alt | `apify /trudax/reddit-scraper-lite` | flat + per-result | `searches`, `sort`, `time`, `maxItems` |

`sort` (search): `RELEVANCE | HOT | TOP | NEW | COMMENTS`. `time_range`:
`all | year | month | week | day | hour`. `sort_type` (comments):
`CONFIDENCE | TOP | NEW | HOT | CONTROVERSIAL`.

> **Reddit APP API IDs need a type prefix**: posts are `t3_<id>`, comments
> `t1_<id>`. The search result's `id` already includes it — reuse verbatim.

Run `monid inspect -p <provider> -e <endpoint>` before a run to confirm the
current price and schema.

## Recovery from run history (free)

Every `monid run` is stored server-side and re-downloadable at no charge:
```bash
monid runs list -j | jq '[.[] | {runId, endpoint, status, createdAt}]'
monid runs get -r <runId> -j -o recovered.json   # same -o unwrap rules
```
If a saved file looks empty, check `monid runs list` before paying to re-run —
you may just need to re-extract with the right jq path.
