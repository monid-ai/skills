---
name: investor-sourcing
version: 0.0.1
description: An AI investor associate that sources early-stage founders before they're obvious. Two signals - (1) monitor who key influencers/investors newly follow on X, (2) monitor viral product launches from small accounts. Tailors to the investor's focus area. Use when asked to "source founders", "find early startups", "who's building", "scout deals", "sourcing digest", or "investor sourcing".
---

# Investor Sourcing

An associate that finds **early-stage founders before they're obvious**, using two complementary signals on X (Twitter), enriched into a decision-ready digest. Everything routes through the `monid` CLI.

## The two approaches

1. **Influencer Following Monitor** (scheduled, every ~2 days) — when a respected investor/operator follows a new no-name account, that's often the earliest public signal of conviction. Diff their followings over time → surface new founder follows.
2. **Viral Launch Monitor** (daily, or ad hoc) — real founders with no audience still get organic engagement when their product is interesting. Search X for launches in the past 24h, filter to small accounts (<5K followers) with healthy virality.

Both modes output: **company, company URL, one-liner, founder background.**

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



## State & files

The skill **ships with** a bundled seed list and writes per-user state under a single XDG-standard data directory so multiple monid skills don't collide.

```
<skill dir>/influencers.seed.json                                              # SHIPPED — {_meta, influencers:[...]}, 86 verified influencers tagged by category

${XDG_DATA_HOME:-$HOME/.local/share}/monid/investor-sourcing/                  # state root
  profile.json                                                                  # user focus areas, geo, custom handles, enrich cap, schedule choice
  influencers.json                                                              # working list (seeded from .seed.json, then user-editable)
  snapshots/<handle>_<date>.json                                                # followings snapshots (Mode 1)
  digests/YYYY-MM-DD.md                                                         # output digests
  last_run.json                                                                 # timestamps per mode (drives "what's due")
```

Concrete paths used throughout this skill (substitute these into commands):

- `${XDG_DATA_HOME:-$HOME/.local/share}/monid/investor-sourcing/profile.json`
- `${XDG_DATA_HOME:-$HOME/.local/share}/monid/investor-sourcing/influencers.json`
- `${XDG_DATA_HOME:-$HOME/.local/share}/monid/investor-sourcing/snapshots/`
- `${XDG_DATA_HOME:-$HOME/.local/share}/monid/investor-sourcing/digests/`
- `${XDG_DATA_HOME:-$HOME/.local/share}/monid/investor-sourcing/last_run.json`

Resolve `<skill dir>` to the directory this SKILL.md lives in. Read the user's `influencers.json` so their edits/additions persist; never overwrite it. Snapshots are large — don't commit them anywhere.

### First-run bootstrap

Triggered when the state directory above doesn't exist OR `monid keys list` shows no active key. In that order:

1. **Briefly** tell the user what monid is and that it's pay-as-you-go, then proceed.
2. Run the preflight from the Prerequisites section above.
3. Create the state directories:
   ```bash
   DEST="${XDG_DATA_HOME:-$HOME/.local/share}/monid/investor-sourcing"
   mkdir -p "$DEST/snapshots" "$DEST/digests"
   ```
4. Seed the user's editable influencer list from the shipped seed:
   ```bash
   cp "<skill dir>/influencers.seed.json" "$DEST/influencers.json"
   ```
   From that point on, treat `influencers.json` as user-owned; never overwrite it.

---

## Setup (hybrid: interactive first run, editable config after)

On first run (or when `${XDG_DATA_HOME:-$HOME/.local/share}/monid/investor-sourcing/profile.json` is missing / user says "reset focus"), ask via AskUserQuestion:

1. **Focus areas** (multi-select): AI infra, AI apps, robotics/physical AI, crypto, fintech, biotech, defense, consumer, devtools, climate, hardware
2. **Geo preference**: SF / NYC / global / other
3. **Custom influencers** to add beyond the seed list

> Do NOT ask about funding stage. Stage is often impossible to tell from the outside (especially for the earliest founders, who are the whole point). The skill targets "earliest possible" by design — no stage filter needed.

Write answers to `${XDG_DATA_HOME:-$HOME/.local/share}/monid/investor-sourcing/profile.json`. On later runs, read it silently. The user can hand-edit `profile.json` anytime; respect it as-is.

Example `${XDG_DATA_HOME:-$HOME/.local/share}/monid/investor-sourcing/profile.json`:
```json
{
  "focus_areas": ["ai_infra", "robotics"],
  "geo": "global",
  "custom_influencers": ["somevc", "anotherangel"],
  "enrich_cap": 5,
  "schedule": "agent-native"
}
```

---

## Mode 1 — Influencer Following Monitor (scheduled, every ~2 days)

### Why this needs to be scheduled

This mode is **snapshot-and-diff**. X doesn't tell you *when* someone followed someone else, and the followings list isn't sorted by recency — so the only way to detect new follows is to pull a full list now and compare it to a list pulled earlier.

**The first run only establishes a baseline — no new-follow results yet.** From the second run onward, every run surfaces what changed since the previous snapshot. That means Mode 1 is only useful if it runs **at least twice**, ~2 days apart. Running it once and then forgetting wastes the cost of the baseline snapshot.

### Schedule setup (ask once)

On first invocation of Mode 1, **before** taking the baseline snapshot:

1. Explain the above to the user in 2–3 sentences.
2. Propose **agent-native scheduling** as the recommended option (no system access, no crontab edits, works regardless of OS). Ask via AskUserQuestion: *"Should I register this with the agent's scheduler to run every 2 days?"*
3. If the user says yes: register the schedule (via the agent's `/schedule`, `/loop`, or equivalent) and store `"schedule": "agent-native"` in `profile.json`.
4. If the user says no: store `"schedule": "manual"` in `profile.json` and tell them the date to come back on (today + 2). Set a reminder if the agent has that capability.

**Only switch to other mechanisms (cron, launchd) if the user asks for them.** When they do, generate the exact line/plist and walk them through installing it — never modify `crontab` or call `launchctl` automatically. Update `profile.json` accordingly: `"schedule": "cron"` or `"schedule": "launchd"`.

Don't re-ask on subsequent runs — read `profile.json` and respect the stored choice.

### Cost estimate (before each run, dynamic)

Mode 1 cost = `pages-per-influencer × per-page-cost × number-of-influencers-selected`. Estimate it dynamically — **do NOT hard-code prices** into the skill output:

1. Run `monid inspect -p tikhub -e /api/v1/twitter/web/fetch_user_followings` and read the current per-call price from the `Pricing` section.
2. The endpoint returns ~67 follows per page; pages per influencer ≈ `ceil(followings_count / 67)`. If `followings_count` is unknown for a handle, fetch one page first to read it.
3. Compute `estimated_cost = mean_pages × per_call_price × N_influencers`.
4. **Notify** the user up front: *"This Mode 1 run will snapshot N influencers and is estimated to cost ~$X.XX. Starting now."* No permission ask — just a notification.

After the run, sum `cost.value` across all calls and show the **actual** spend in the digest footer alongside the estimate.

### Run

```bash
# For each relevant influencer (filtered by focus area):
monid run -p tikhub -e /api/v1/twitter/web/fetch_user_followings \
  --query '{"screen_name":"<handle>"}' --wait 30 -j -o page.json
# paginate using output.next_cursor until output.more_users == false
```

Steps:
1. **Select influencers**: read the `influencers` array from `${XDG_DATA_HOME:-$HOME/.local/share}/monid/investor-sourcing/influencers.json` (structure: `{_meta, influencers:[{handle,name,category,followers,active}]}`; e.g. `jq '.influencers[]'`). Select:
   - Everyone tagged `category: "vc_angel"` (early-stage investors/incubator partners — relevant across all focus areas), PLUS
   - Everyone whose `category` matches the user's `focus_areas` (topic tags: `ai`, `ai_apps`, `crypto`, `robotics`, `biotech`, `defense`, `hardware`, `consumer`), PLUS
   - The user's `custom_influencers`.
   If a focus area has thin coverage in the seed list, ask the user for additional handles. (To keep cost sane, you may cap VCs to the most active/relevant N and let the user widen it.)
2. **Snapshot** each influencer's full followings (paginate via `next_cursor` until `more_users == false` — read these from the unwrapped file written by `-o`; see the snippet above). Save to `${XDG_DATA_HOME:-$HOME/.local/share}/monid/investor-sourcing/snapshots/<handle>_<date>.json`.
3. **Diff** vs. previous snapshot on `user_id` → `new_follows` and `unfollows` (keep unfollows — a quiet unfollow can be a signal too).
4. **Classify** each new follow: founder / VC / influencer / other. Keep founders (bio matches "founder", "CEO", "building", "co-founder", or links to a company site).
5. **Filter by focus** (LLM judgment): does this founder's company match the user's thesis? Drop mismatches.
6. **Enrich** top N founders (N = `enrich_cap`, default 5) — see Enrichment section.
7. Append to today's digest under "New founder follows".

---

## Mode 2 — Viral Launch Monitor (daily, or ad hoc)

Can be run **on demand anytime** (not just on the daily schedule) and over a **custom time range**.

### Time range (customizable)
Default is the past 24h. The user can override by passing a natural-language window when invoking — e.g. "launches in the last 3 days", "this week", "between May 20 and May 25". Translate it to X search operators:
- `since:<YYYY-MM-DD>` — start of window (inclusive)
- `until:<YYYY-MM-DD>` — end of window (exclusive); omit for "up to now"

| User says | Operators (today = 2026-05-28) |
|---|---|
| (nothing) / "today" / "last 24h" | `since:2026-05-27` |
| "last 3 days" | `since:2026-05-25` |
| "this week" / "last 7 days" | `since:2026-05-21` |
| "May 20 to May 25" | `since:2026-05-20 until:2026-05-26` |

> Wider windows return more results and cost slightly more, but recall improves. For windows > 3 days, consider raising `min_faves` to keep the signal-to-noise high.

### Cost estimate (before each run, dynamic)

Estimate Mode 2 spend the same way as Mode 1 — **do NOT hard-code prices**:

1. Run `monid inspect -p tikhub -e /api/v1/twitter/web/fetch_search_timeline` to read the current per-call price.
2. Multiply by the number of parallel searches you plan to run (4–6 by default).
3. Notify the user up front: *"This Mode 2 run will fire N searches and is estimated to cost ~$X.XX. Starting now."*
4. After the run, sum `cost.value` and show the actual spend in the digest footer.

### Run

```bash
monid run -p tikhub -e /api/v1/twitter/web/fetch_search_timeline \
  --query '{"keyword":"<query> since:<YYYY-MM-DD> [until:<YYYY-MM-DD>] -filter:replies lang:en min_faves:30","search_type":"Latest"}' \
  --wait 30 -j -o search.json
```

Steps:
1. **Build queries** from focus area (see keyword map) + the resolved time-range operators. Run 4-6 parallel searches, `lang:en`, `-filter:replies`, `min_faves:30` (raise for wider windows).
2. **Merge & dedupe** on `tweet_id`.
3. **Filter — early-stage gate**: keep `user_info.followers_count < 5000` (and > 0).
4. **Filter — engagement sanity (anti-bought-engagement)**: drop tweets where `retweets / favorites > 0.5`. (Founders often buy reposts/quotes for launches; a RT/like ratio above 50% looks fake. This is the only engagement rule — keep it lenient, just catch the obviously weird ones.)
5. **Classify**: real launch / commentary / shilling someone else's project / unrelated. Keep only real first-party launches.
6. **Source gate**: keep launches from founder personal accounts (top priority) AND company/brand accounts (lower priority). SKIP only shills reposting someone else's launch, aggregators, and pure commentary (see Enrichment Step 1).
7. **Identify the company** from tweet text, bio website, or pinned tweet; identify the founder from the X profile, or the brand account's bio/website.
8. **Enrich** top N (default 5).
9. Append to today's digest under "Viral launches".

Cadence: daily.

### Focus-area → keyword map
| Focus | Search keywords (OR-joined) |
|---|---|
| AI infra | "VLA", "GPU kernels", "inference", "training", "foundation model" |
| AI apps | "AI agent", "launching", "now live", "we built", "AI app" |
| Robotics | "robot", "embodied AI", "humanoid", "teleop", "VLA" |
| Crypto | "TGE", "mainnet", "we shipped", "testnet live", "introducing" |
| Fintech | "launching", "now live", "payments", "banking", "we built" |
| Consumer | "launching app", "TestFlight", "now live", "meet" |
| Devtools | "open-source", "we built", "introducing", "now live", "v1" |
Generic always-on: "introducing", "launching today", "just shipped", "I built", "we built".

---

## Enrichment (both modes, capped at top N)

For each candidate, produce: **company, URL, one-liner, founder name + background.**

### Step 1 — Identify the source & founder from X

Read the X profile of the launching account (Mode 2) or newly-followed account (Mode 1):
```bash
monid run -p tikhub -e /api/v1/twitter/web/fetch_user_profile \
  --query '{"screen_name":"<handle>"}' --wait 20 -j -o prof.json
```

**Both founder personal accounts AND company/brand accounts are acceptable** — but **prioritize founder accounts** in ranking (a real person launching is a stronger signal than a brand account). Classify the account:
- **Founder personal account** (highest priority): personal name + first-person founder language ("founder", "co-founder", "CEO", "I built", "we built", "building X"). Founder name = display `name`.
- **Company / brand account** (still keep, lower priority): the product's own account. Try to find the founder: check the bio for a personal handle, or the website's team/about page (WebFetch). If no founder is findable, keep the company anyway with founder = "unknown — brand account."
- **SKIP only these**: hype/shill accounts reposting someone *else's* launch, aggregators, "10 tools you should try" threads, pure commentary with no product of their own.

**Ranking**: founder personal accounts first, then company accounts with an identified founder, then company accounts with unknown founder.

### Step 2 — Enrich the founder & company from free sources

Once we have a real founder name from X, build their background from the signals that are free and reliable — the X profile/bio and the company website. (Do **not** use paid people/company data providers; they 404 on the early-stage founders this skill targets and mismatch on new domains — net-negative.)

- **Founder background** — from the X bio (`desc`), display name, and location, plus the website's team/about page (WebFetch). Pull prior roles/companies, education, and location where stated. If the bio links a LinkedIn, note it.
- **Company URL** = website in the X bio, or the link in the launch tweet.
- **One-liner** = WebFetch the site for a ≤20-word description (free, via the WebFetch tool, not monid). Fall back to the launch tweet's own words if the site is thin or blocks scraping.
- **Funding / stage** — only if explicitly stated on the site, in the launch tweet, or in a press link. Never guess. If nothing is found, note "no funding data — likely very early," which is itself a useful early-stage signal.

> The X profile is the gate (founder name + bio); the website fills in the rest. Both are free — enrichment adds essentially no cost beyond the `fetch_user_profile` call.

### Step 2.5 — LinkedIn fallback (optional, when X + website are thin)

If after Steps 1–2 the founder's background is still thin (no prior roles, no team page on the website) AND the X bio or launch tweet linked to a LinkedIn profile, fall back to LinkedIn via TikHub.

**Important — the base call returns only thin profile data.** The base response gives you `full_name`, `headline` (e.g. "Co-Founder at Monid"), `location`, profile photo, and account-status booleans. That's **not enough** to fill in "founder background." The unlocks that justify the fallback are `include_experiences` and `include_educations`. Without those flags, this fallback is not worth running — fall back to "no further background found" instead.

**Endpoint**: `tikhub /api/v1/linkedin/web/get_user_profile`. Pricing is per-call. **Each `include_*` flag adds +1 request**, so enabling experiences + education + bio costs 4× the base price. Always estimate first.

Extract the LinkedIn username from a profile URL: `https://www.linkedin.com/in/jack` → `jack`.

Inspect the current price and flag list:
```bash
monid inspect -p tikhub -e /api/v1/linkedin/web/get_user_profile
```

Call (background-rich — this is the one to use):
```bash
monid run -p tikhub -e /api/v1/linkedin/web/get_user_profile \
  --query '{
    "username":"<linkedin-username>",
    "include_experiences": true,
    "include_educations": true,
    "include_bio": true
  }' \
  --wait 30 -j -o linkedin.json
```

Fields to extract from the saved file (jq paths are top-level since `-o` unwrapped the envelope) and merge into the digest's "Founder background" line:
- Base: `full_name`, `headline`, `location.city`, `location.country`
- From `include_experiences=true`: `experiences[]` (company, title, dates)
- From `include_educations=true`: `educations[]` (school, degree)
- From `include_bio=true`: the "About" text

**Triggering rule** — default OFF. Only fall back to LinkedIn when **all three** are true:
1. X bio gave you nothing usable beyond a name (no prior role, no website).
2. WebFetch on the company site didn't yield a team/about page either.
3. The X bio or launch tweet explicitly links a LinkedIn URL — never guess the LinkedIn username from a name.

Report the per-call cost in the run summary so the user sees the marginal spend. If the LinkedIn lookup fails (404 / private profile), fall back gracefully to "no further background found."

---

## Output: the digest

Write one markdown file per run to `${XDG_DATA_HOME:-$HOME/.local/share}/monid/investor-sourcing/digests/YYYY-MM-DD.md`. Each candidate:

```markdown
### [Founder Name] — @handle
- **Company**: <name>
- **URL**: <website>
- **One-liner**: <what they do, ≤20 words>
- **Founder background**: <prior roles / companies / education / location, from X bio + website + (optionally) LinkedIn>
- **Stage signal** *(only if known — never guess)*: <funding stated on site / launch tweet / press, or "no funding data — likely very early">
- **Why surfaced**: Mode 1 → "followed by @X, @Y" | Mode 2 → "❤️ N, 🔁 M, 👁 V, tweet link"
```

Digest footer:
```markdown
## Stats
- Influencers scanned: N
- New founder follows: N
- Viral launches qualifying: N
- Candidates enriched: N (cap)
- Estimated spend: $X.XX
- Actual spend: $Y.YY
```

---

## Cadence: manual + scheduled (both)

- **Manual / ad hoc**: user invokes the skill anytime. Read `last_run.json`; tell them which mode is due and run it, OR run exactly the mode they ask for. Mode 2 accepts a custom time range on ad hoc calls (see Mode 2 → Time range). Examples:
  - "source founders" → run whichever mode is due
  - "check launches today" → Mode 2, past 24h
  - "show me launches from the last 3 days" → Mode 2, `since:` 3 days ago
  - "scan new follows now" → Mode 1, regardless of schedule
- **Scheduled** (see Mode 1 → "Schedule setup"): the chosen schedule lives in `profile.json`. Mode 2 also benefits from daily scheduling — same agent-native default applies.

Store schedule state so manual + scheduled runs share the same snapshots/digests and don't double-charge. Ad hoc and scheduled runs are independent — running Mode 2 ad hoc over a custom window does NOT reset the daily schedule's clock, and vice versa.

---

## Cost discipline

- **Estimate before, report after** for every run (see Mode 1 and Mode 2 cost-estimate subsections). Never hard-code a price into the output; always read it fresh from `monid inspect`.
- Report `cost.value` per run; show a per-digest total alongside the estimate.
- Mode 1 snapshots are the biggest line item. Only snapshot focus-relevant influencers.
- Enrichment is capped at top N (default 5). List overflow candidates unenriched; enrich-on-request by name.
- LinkedIn fallback (Enrichment Step 2.5) is OFF by default. When on, each `include_*` flag bills as an extra request — turn on only what you'll use (experiences + education are the unlocks; the base call alone is rarely worth it).
- Re-run `monid discover` occasionally to catch cheaper/better endpoints, but default to the validated set below.

---

## Reference data: validated endpoints

| Purpose | Provider / Endpoint | Pricing | Params |
|---|---|---|---|
| Followings (paginated) | `tikhub /api/v1/twitter/web/fetch_user_followings` | per-call | `--query` |
| Profile lookup — founder name + bio (the GATE) | `tikhub /api/v1/twitter/web/fetch_user_profile` | per-call | `--query` |
| Launch/keyword search | `tikhub /api/v1/twitter/web/fetch_search_timeline` | per-call | `--query` |
| LinkedIn fallback (Step 2.5, optional) | `tikhub /api/v1/linkedin/web/get_user_profile` | per-call (×1 + each `include_*` flag) | `--query` |
| Company one-liner + founder background | `WebFetch` tool (the site) | free | URL |

Run `monid inspect -p <provider> -e <endpoint>` before each run to read the current per-call price and confirm the schema hasn't changed. Cost estimates in this skill rely on `inspect` output, not hard-coded numbers.

`fetch_search_timeline` supports X advanced search operators in `keyword`: `since:`/`until:`, `min_faves:`, `-filter:replies`, `lang:en`, `OR`, quoted phrases. `search_type`: `Latest` (chronological) or `Top`.

> **Important — follow ordering**: `fetch_user_followings` does NOT return follows in chronological order (it's algorithmic). You cannot tell "most recent follow" from a single pull. New follows are only detectable by diffing two full snapshots over time.

---

## Recovery from run history (when a saved file is wrong or lost)

Every `monid run` is stored server-side and can be re-downloaded for free.
Use this when:

- A snapshot/search file is empty, malformed, or written with the wrong shape
  (e.g. you wrote `.output.X` jq paths and got nulls — the run itself was
  fine, just the file extraction was wrong).
- Mode 1 baseline snapshots got lost or partially written.
- You want to verify what an earlier run actually returned.

```bash
# List recent runs (newest first).
monid runs list

# Machine-readable form for filtering by endpoint, status, or time:
monid runs list -j | jq '[.[] | {runId, provider, endpoint, status, createdAt}]'

# Re-fetch one run's payload. Same file-shape rules as `monid run`:
# the -o file holds ONLY the unwrapped output (no `.output.` prefix in jq).
monid runs get -r <runId> -j -o recovered.json
```

Recovery is **free** — fetching run history does NOT re-charge the run's
per-call cost. If you find yourself about to re-run Mode 1 because the
snapshots look empty, **STOP and check `monid runs list` first** — you may
already have the data and just need to re-extract it with the right jq paths.

When re-fetching a paginated endpoint (Mode 1 followings), list runs for the
same `screen_name` and re-fetch each page's runId in cursor order to
reconstruct the full followings list.
