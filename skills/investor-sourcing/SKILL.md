---
name: investor-sourcing
version: 0.2.0
description: An AI investor associate that sources early-stage founders before they're obvious. Two signals - (1) monitor who key influencers/investors newly follow on X, (2) monitor viral product launches from small accounts. Tailors to the investor's focus area. Use when asked to "source founders", "find early startups", "who's building", "scout deals", "sourcing digest", or "investor sourcing".
---

# Investor Sourcing

An associate that finds **early-stage founders before they're obvious**, using two complementary signals on X (Twitter), enriched into a decision-ready digest. Everything routes through the `monid` CLI.

## The two approaches

1. **Influencer Following Monitor** (every ~2 days) — when a respected investor/operator follows a new no-name account, that's often the earliest public signal of conviction. Diff their followings over time → surface new founder follows.
2. **Viral Launch Monitor** (daily) — real founders with no audience still get organic engagement when their product is interesting. Search X for launches in the past 24h, filter to small accounts (<5K followers) with healthy virality.

Both modes output: **company, company URL, one-liner, founder background.**

---

## Prerequisites & first-time setup (check every run)

This skill is **standalone** — it does NOT require the separate "monid" skill to be installed. It only needs the `monid` CLI (a small npm package) plus an API key. The skill bootstraps both itself.

**What is monid, and why is it needed?** This skill gets its data (X/Twitter profiles, follow lists, launch search) from [monid](https://monid.ai), a marketplace that routes to data providers like TikHub. It's **pay-as-you-go** — you fund a small balance and each call costs a fraction of a cent to a few cents (a full sourcing run is typically well under $5). The skill reports costs as it goes. There's no free tier; without a funded monid key, the skill cannot fetch data.

> **Surface this to the user — don't just read it silently.** On the **first run** (when `~/.investor-sourcing/` doesn't exist yet) AND whenever the CLI or key is missing, tell the user in your own words, before running any install/setup command: what monid is, that it's the paid data source this skill depends on, and that runs are pay-as-you-go (typically under $5). Never ask a user to `npm install` or fund a balance without first explaining what they're installing and why. Keep it to a sentence or two — don't lecture a returning user who's already set up.

**Preflight — run these checks at the start of every invocation:**

```bash
# 1. Is the CLI installed?
monid --version || npm install -g @monid-ai/cli

# 2. Is an API key configured?
monid keys list
```

**If the CLI isn't installed**, install it with the command above (global npm). If npm itself is missing, tell the user to install Node.js first (https://nodejs.org).

**If no key is configured**, STOP and walk the user through setup — do not proceed until a key is added:
1. Create an account → https://app.monid.ai
2. Add funds (pay-as-you-go balance) in the dashboard
3. Generate an API key → https://app.monid.ai/access/api-keys
4. Save it: `monid keys add -k <their-key> -l main`
5. Confirm: `monid keys list`

**Optionally** verify there's balance before a run: `monid balance`. If empty, point them to the dashboard to add funds.

> Use the **CLI**, never an MCP `monid_run` tool — CLI is the reliable source of truth. Set `NO_COLOR=1` for clean scripted output. The CLI workflow is: `monid run -p <provider> -e <endpoint> --query '<json>' -i '<json>' --wait <sec> -j -o <file>`. If an endpoint's params are ever unclear, run `monid inspect -p <provider> -e <endpoint>` first.

---

## State & files

The skill **ships with** a bundled seed list, and writes per-user state to the home directory:

```
<skill dir>/influencers.seed.json   # SHIPPED with the skill — {_meta, influencers:[...]}, 86 verified influencers tagged by category

~/.investor-sourcing/               # created on first run (per-user state)
  profile.json                      # user focus area, geo, custom handles, enrich cap
  influencers.json                  # the user's working list (seeded from influencers.seed.json, then editable)
  snapshots/                        # <handle>_<date>.json followings snapshots (Mode 1)
  digests/                          # YYYY-MM-DD.md output digests
  last_run.json                     # timestamps per mode (drives "what's due")
```

**First-run bootstrap** (do this when `~/.investor-sourcing/` doesn't exist):
```bash
mkdir -p ~/.investor-sourcing/snapshots ~/.investor-sourcing/digests
# Copy the shipped seed into the user's editable working list:
cp "<skill dir>/influencers.seed.json" ~/.investor-sourcing/influencers.json
```
Because this directory is absent on a true first run, use its absence as the trigger to give the user the plain-language "what is monid" explanation above — even if the `monid` CLI happens to already be installed. A first-time user should always learn what the paid data dependency is before the skill starts spending.
Resolve `<skill dir>` to the directory this SKILL.md lives in. From then on, read the user's `~/.investor-sourcing/influencers.json` (so their edits/additions persist); never overwrite it. Snapshots are large — don't commit them anywhere.

---

## Setup (hybrid: interactive first run, editable config after)

On first run (or when `profile.json` is missing / user says "reset focus"), ask via AskUserQuestion:

1. **Focus areas** (multi-select): AI infra, AI apps, robotics/physical AI, crypto, fintech, biotech, defense, consumer, devtools, climate, hardware
2. **Geo preference**: SF / NYC / global / other
3. **Custom influencers** to add beyond the seed list

> Do NOT ask about funding stage. Stage is often impossible to tell from the outside (especially for the earliest founders, who are the whole point). The skill targets "earliest possible" by design — no stage filter needed.

Write answers to `profile.json`. On later runs, read it silently. The user can hand-edit `profile.json` anytime; respect it as-is.

Example `profile.json`:
```json
{
  "focus_areas": ["ai_infra", "robotics"],
  "geo": "global",
  "custom_influencers": ["somevc", "anotherangel"],
  "enrich_cap": 5
}
```

---

## Mode 1 — Influencer Following Monitor (every ~2 days)

### How it works (explain this to the user the first time)

X does not tell you *when* someone followed someone else, and the followings list is not sorted by recency — so there's no way to ask "who did this person follow yesterday?" directly.

The workaround is **snapshot-and-diff**:
1. We pull a full list of everyone an influencer follows and save it as a dated "snapshot."
2. Two days later, we pull the list again.
3. We compare the two: anyone in the new list who wasn't in the old one is a **brand-new follow**. Those are the signals we care about.

So the **first run just establishes a baseline** (no new-follow results yet — that's expected). From the second run onward, every run surfaces what changed since last time. We do this every ~2 days because founder-follows don't appear minute-to-minute, and each full snapshot has a small cost (~$0.13 per influencer). Tell the user this up front so the empty first run doesn't look broken.

```bash
# For each relevant influencer (filtered by focus area):
monid run -p tikhub -e /api/v1/twitter/web/fetch_user_followings \
  --query '{"screen_name":"<handle>"}' --wait 30 -j -o page.json
# paginate using output.next_cursor until output.more_users == false
```

Steps:
1. **Select influencers**: read the `influencers` array from `~/.investor-sourcing/influencers.json` (structure: `{_meta, influencers:[{handle,name,category,followers,active}]}`; e.g. `jq '.influencers[]'`). Select:
   - Everyone tagged `category: "vc_angel"` (early-stage investors/incubator partners — relevant across all focus areas), PLUS
   - Everyone whose `category` matches the user's `focus_areas` (topic tags: `ai`, `ai_apps`, `crypto`, `robotics`, `biotech`, `defense`, `hardware`, `consumer`), PLUS
   - The user's `custom_influencers`.
   If a focus area has thin coverage in the seed list, ask the user for additional handles. (To keep cost sane, you may cap VCs to the most active/relevant N and let the user widen it.)
2. **Snapshot** each influencer's full followings (paginate ~67/page; ~$0.0015/page; ~87 pages for someone following 5,800 → ~$0.13). Save to `snapshots/<handle>_<date>.json`.
3. **Diff** vs. previous snapshot on `user_id` → `new_follows` and `unfollows` (keep unfollows — a quiet unfollow can be a signal too).
4. **Classify** each new follow: founder / VC / influencer / other. Keep founders (bio matches "founder", "CEO", "building", "co-founder", or links to a company site).
5. **Filter by focus** (LLM judgment): does this founder's company match the user's thesis? Drop mismatches.
6. **Enrich** top N founders (N = `enrich_cap`, default 5) — see Enrichment section.
7. Append to today's digest under "New founder follows".

Cadence: every 2 days (founder follows don't appear faster; snapshots are heavy).

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

> Wider windows return more results and cost slightly more (still pennies), but recall improves. For windows > 3 days, consider raising `min_faves` to keep the signal-to-noise high.

```bash
monid run -p tikhub -e /api/v1/twitter/web/fetch_search_timeline \
  --query '{"keyword":"<query> since:<YYYY-MM-DD> [until:<YYYY-MM-DD>] -filter:replies lang:en min_faves:30","search_type":"Latest"}' \
  --wait 30 -j -o search.json
```

Steps:
1. **Build queries** from focus area (see keyword map) + the resolved time-range operators. Run 4-6 parallel searches, `lang:en`, `-filter:replies`, `min_faves:30` (raise for wider windows). ~$0.0015 each.
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

> The X profile is the gate (founder name + bio); the website fills in the rest. Both are free — enrichment adds essentially no cost beyond the `fetch_user_profile` call. If the user later wants verified background/funding for a *specific* named founder, ask before adding any paid lookup.

---

## Output: the digest

Write one markdown file per run to `~/.investor-sourcing/digests/YYYY-MM-DD.md`. Each candidate:

```markdown
### [Founder Name] — @handle
- **Company**: <name>
- **URL**: <website>
- **One-liner**: <what they do, ≤20 words>
- **Founder background**: <prior roles / companies / education / location, from X bio + website>
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
- Total spent this run: $X.XX
```

---

## Cadence: manual + scheduled (both)

- **Manual / ad hoc**: user invokes the skill anytime. Read `last_run.json`; tell them which mode is due and run it, OR run exactly the mode they ask for. Mode 2 accepts a custom time range on ad hoc calls (see Mode 2 → Time range). Examples:
  - "source founders" → run whichever mode is due
  - "check launches today" → Mode 2, past 24h
  - "show me launches from the last 3 days" → Mode 2, `since:` 3 days ago
  - "scan new follows now" → Mode 1, regardless of schedule
- **Scheduled**: offer to wire recurring jobs via `/schedule` (or `/loop`):
  - Viral Launch Monitor → daily (past 24h)
  - Influencer Following Monitor → every 2 days
  Store schedule state so manual + scheduled runs share the same snapshots/digests and don't double-charge.

> Ad hoc and scheduled runs are independent — running Mode 2 ad hoc over a custom window does NOT reset the daily schedule's clock, and vice versa.

---

## Cost discipline

- Report `cost.value` per run; show a per-digest total.
- Before a run with estimated spend > $5, check `monid balance` and confirm with the user.
- Mode 1 snapshots are the biggest line item (~$0.13/influencer). Only snapshot focus-relevant influencers.
- Enrichment is capped at top N (default 5). List overflow candidates unenriched; enrich-on-request by name.
- Re-run `monid discover` occasionally to catch cheaper/better endpoints, but default to the validated set below.

---

## Reference data: validated endpoints

| Purpose | Provider / Endpoint | Cost | Params |
|---|---|---|---|
| Followings (paginated) | `tikhub /api/v1/twitter/web/fetch_user_followings` | $0.0015/call | `--query` |
| Profile lookup — founder name + bio (the GATE) | `tikhub /api/v1/twitter/web/fetch_user_profile` | $0.0015/call | `--query` |
| Launch/keyword search | `tikhub /api/v1/twitter/web/fetch_search_timeline` | $0.0015/call | `--query` |
| Company one-liner + founder background | `WebFetch` tool (the site) | free | URL |

> Enrichment is free: the X profile is the gate (founder name + bio), and WebFetch fills in the company one-liner, background, and any stated funding. This skill deliberately uses **no paid people/company data provider** — they 404 on the earliest founders it targets. If the user needs verified background/funding for a specific named founder, ask before adding a paid lookup.

`fetch_search_timeline` supports X advanced search operators in `keyword`: `since:`/`until:`, `min_faves:`, `-filter:replies`, `lang:en`, `OR`, quoted phrases. `search_type`: `Latest` (chronological) or `Top`.

> **Important — follow ordering**: `fetch_user_followings` does NOT return follows in chronological order (it's algorithmic). You cannot tell "most recent follow" from a single pull. New follows are only detectable by diffing two full snapshots over time.
