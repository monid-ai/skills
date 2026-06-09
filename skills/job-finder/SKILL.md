---
name: job-finder
version: 0.1.2
description: A personal job-hunting associate that surfaces roles NOT on the obvious job boards — especially startup jobs posted from founders' personal accounts. Three signals daily — (1) X posts about hiring, (2) LinkedIn posts about hiring, (3) LinkedIn job board listings — tailored to the user's role, skills, industry, and location. Use when asked to "find jobs", "scan for roles", "what's hiring", "job radar", "job search", "find me work", or "job finder".
---

# Job Finder

A personal job-hunt associate that finds **roles that aren't on the obvious job boards** — especially startup jobs that go out as a tweet or a LinkedIn post from the founder's personal account.

## Why three sources

Many of the best early-stage roles never reach a job board:
- **X posts** — founders tweet "we're hiring eng #3, DM me" and the opening fills in 24h
- **LinkedIn posts** — founders/heads of write long-form hiring posts that don't get posted as formal listings
- **LinkedIn job board** — the formal listings, still worth scanning for companies that match your thesis

The skill watches all three daily, dedupes across them, ranks by match score, and produces a digest.

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

The skill writes per-user state under a single XDG-standard data directory so multiple monid skills don't collide.

```
${XDG_DATA_HOME:-$HOME/.local/share}/monid/job-finder/   # state root
  profile.json                                           # user role, skills, industries, location, stage, exclusions
  digests/                                               # YYYY-MM-DD.md output digests
  last_run.json                                          # timestamps per mode
```

Concrete paths used throughout this skill (substitute these into commands):

- `${XDG_DATA_HOME:-$HOME/.local/share}/monid/job-finder/profile.json`
- `${XDG_DATA_HOME:-$HOME/.local/share}/monid/job-finder/digests/`
- `${XDG_DATA_HOME:-$HOME/.local/share}/monid/job-finder/last_run.json`

**First-run bootstrap** (when the state directory above doesn't exist):
```bash
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/monid/job-finder"
mkdir -p "$DEST/digests"
```
Search keywords are generated on the fly from the user's profile (see "Building queries" below) — no seed file needed.

---

## Setup (hybrid: interactive first run, editable config after)

On first run (or when `${XDG_DATA_HOME:-$HOME/.local/share}/monid/job-finder/profile.json` is missing / user says "reset profile"), ask via AskUserQuestion:

1. **Role(s)** you want (multi-select + free-text): founding engineer, senior eng, staff eng, ML researcher, product designer, founding designer, PM, founding PM, data scientist, GTM/sales, other...
   - **1b. Seniority level(s)** *(optional, multi-select — skip to let titles + judgment decide)*: entry / associate / mid-senior / director / executive. Pick one or more. Level is orthogonal to role (so "PM" + "mid-senior" compose), and it's the one lever LinkedIn's jobs board filters on server-side. **Skip** if your target roles are founding/first-hire — those don't map to LinkedIn's levels, so the skill judges them from context instead.
2. **Industries / focus areas** (multi-select): AI, robotics/physical AI, crypto, fintech, biotech, devtools, consumer, climate, defense, hardware, any
3. **Location / remote**: remote-only / SF / NYC / London / hybrid-OK / anywhere
4. **Company stage** (multi-select; stage IS relevant here — it's a fit signal candidates care about): stealth, seed, Series A, Series B+, any
5. **Skills / keywords** (free text): e.g. "Rust, distributed systems", "Figma, design systems"
6. **Custom accounts to monitor** (optional): X/LinkedIn handles you want to track specifically
7. **Exclusions** (optional): companies, accounts, or keywords to drop (e.g. "agency", "crypto", a competitor)

> Don't ask about compensation in setup — too personal and often unknown until conversation. Surface comp in the digest only when the post mentions it.

Write to `${XDG_DATA_HOME:-$HOME/.local/share}/monid/job-finder/profile.json` (i.e. `"$DEST/profile.json"`). Read it silently on later runs. User can hand-edit anytime; respect as-is.

Example `${XDG_DATA_HOME:-$HOME/.local/share}/monid/job-finder/profile.json`:
```json
{
  "roles": ["founding engineer", "senior eng"],
  "levels": ["mid_senior", "director"],
  "industries": ["ai", "robotics"],
  "location": "sf_or_remote",
  "stages": ["seed", "series_a"],
  "skills": ["Rust", "distributed systems", "LLMs"],
  "custom_accounts": ["somefounder"],
  "exclusions": {"companies": ["BigCo"], "keywords": ["crypto", "agency"]},
  "enrich_cap": 10,
  "linkedin_jobs_cap": 25
}
```

`levels` is an **optional list** — any of `entry_level`, `associate`, `mid_senior`, `director`, `executive`. Empty or omitted = current behavior (no seniority filter; rely on the Role-level discipline LLM pass). `internship` is a valid LinkedIn bucket but isn't offered in setup; it's accepted if hand-edited. Omit `levels` for founding/first-hire targets — those don't map to LinkedIn's buckets.

---

## Building queries (used by all three modes)

Construct search queries on the fly from the user's `profile.json` — no seed file. Each query is the product of:

1. **Role phrases** — generate 3-6 OR-joined variants of the role. Examples:
   - `founding engineer` → `"founding engineer" OR "first engineer" OR "eng #2" OR "eng #3" OR "early engineering hire"`
   - `senior eng` → `"senior engineer" OR "senior software engineer" OR "senior swe"`
   - `ML researcher` → `"ML researcher" OR "research scientist" OR "research engineer"`
   - `founding designer` → `"founding designer" OR "first designer" OR "head of design"`
   - `founding PM` → `"founding PM" OR "first product hire" OR "head of product"`
   - `GTM/sales` → `"founding GTM" OR "head of growth" OR "first sales hire" OR "founding AE"`
   Use judgment: real founder phrasing, no jargon padding.

2. **Hiring language** — combine with at least one of: `"we're hiring" OR "we are hiring" OR "looking for" OR "join us" OR "DM if" OR "open role" OR "we need a" OR "now hiring"`.

3. **Industry filter** (when user has `industries` set) — AND with industry terms, e.g. `(AI OR LLM OR agents)` for AI, `(robotics OR humanoid OR "embodied AI")` for robotics, `(crypto OR web3 OR onchain)` for crypto. Generate sensible terms for any industry the user lists.

4. **Skills** (when set) — AND with the user's skills as a quoted phrase or OR-group, e.g. `(Rust OR "distributed systems")`.

5. **Location** (when not remote-anywhere) — append `location:"<city>"` for LinkedIn jobs, or include city name in X queries.

6. **Time window — DEFAULT PAST 2 DAYS, hard cap**: job posts go stale fast. Default `since:` is **2 days ago** (e.g. today=2026-06-07 → `since:2026-06-05`). Never go wider than past 2 days unless the user explicitly asks for a longer window. LinkedIn endpoints: use `date_posted: "past_24_hours"` and either run twice (today + yesterday) or filter post-hoc to keep only `listed_at >= now - 2 days`. Drop anything older.

7. **Seniority** (only when `levels` is set and the role isn't founding/first-hire) — applied differently per source, because only the LinkedIn jobs board has a server-side filter:

   - **LinkedIn jobs (Mode 3)** — pass `experience_level` in `--query`. It accepts **one** value per call, so with N selected levels, run one Mode 3 query per level and merge results. Skip the param entirely for founding roles or empty `levels`.
   - **X (Mode 1) & LinkedIn posts (Mode 2)** — no API filter exists. Build the level OR-group from **all** selected levels, and add **negative operators** only for the levels NOT selected:
     - `["mid_senior"]` → add `("senior" OR "staff")`, strict: `-"junior" -"intern" -"new grad"`
     - `["entry_level","associate"]` → `("junior" OR "new grad" OR "early career" OR "associate")`, strict: `-"senior" -"staff" -"principal"`
     - `["director","executive"]` → `("director" OR "VP" OR "head of" OR "chief")`, strict: `-"junior" -"associate"`
   - Whatever the source, the **Role-level discipline** LLM pass below is the final backstop — keyword filters narrow, judgment decides.

### Role-level discipline

**For every result, check the level matches the user's stated role and feels right.** Levels are distinct careers with different scope, comp, and seniority — "Product Manager" ≠ "Senior PM" ≠ "Staff PM" ≠ "Founding PM" ≠ "Head of Product". A level mismatch is a miss, not a near-miss — drop it even if industry/company/location all fit.

Use judgment: account for the role variations across the industry, including weird hybrids ("Senior or Staff PM"), startup-flexible titles (where "Head of Product" at a 5-person co is closer to "Founding PM" than to a VP role), and synonyms. When in doubt, lean strict — the user can always loosen if results are thin.

---

## Mode 1 — X (Twitter) job-post monitor (daily)

**Hypothesis:** Founders' fastest hiring channel. Often opens & closes in 24h.

```bash
monid run -p tikhub -e /api/v1/twitter/web/fetch_search_timeline \
  --query '{"keyword":"<query> since:<YYYY-MM-DD> [until:<YYYY-MM-DD>] -filter:replies lang:en min_faves:5","search_type":"Latest"}' \
  --wait 30 -j -o x_search.json
```

Steps:
1. **Build queries** from profile (role + skills + industries) per the "Building queries" section above. Run 4-6 parallel searches, **past 2 days** by default (or user-specified window — never wider than 2 days unless explicitly requested), `lang:en`, `-filter:replies`, `min_faves:5` (lower bar than launches — hiring posts get less engagement).
2. **Merge & dedupe** on `tweet_id`.
3. **Hiring-language filter**: tweet text must contain hiring language ("hiring", "looking for", "join us", "DM if", "founding ___", "we need a", "open role", "we're growing"). Drop everything else.
4. **Engagement sanity** (anti-bought engagement): drop if `retweets / favorites > 0.5`.
5. **Classify source** (don't drop, prioritize): **founder personal account** (priority 1) vs **company/brand account** (priority 2).
6. **Apply exclusions** (companies, keywords from profile).
7. Continue to dedup + enrich (cross-cutting section below).

Cost: ~$0.01/day.

---

## Mode 2 — LinkedIn post monitor (daily)

**Hypothesis:** Long-form LinkedIn hiring posts from founders/operators are higher quality than the job board.

Endpoint: `tikhub /api/v1/linkedin/web/search_posts` (**$0.006/call**)
- Required: `keyword`
- Optional: `sort_by` ("date_posted" or "relevance"), `from_member` (filter by member, comma-separated)

```bash
monid run -p tikhub -e /api/v1/linkedin/web/search_posts \
  -i '{"keyword":"<query>","sort_by":"date_posted"}' \
  --wait 30 -j -o li_posts.json
```

Steps:
1. Build queries per profile (role + "hiring" / "we're hiring" / "looking for"). Run 4-6 parallel queries with `sort_by: "date_posted"`.
2. **Drop posts older than 2 days** (filter `created_at >= now - 48h`). LinkedIn post search doesn't expose a direct date filter, so post-filter client-side.
3. **Hiring-language filter** + **exclusions** + **source classify** (founder/company), same as Mode 1.
4. **Role-level filter**: drop posts whose mentioned role title doesn't match the user's level (see Role-level discipline section above).
5. Capture: poster name, poster title, company (from poster's headline), post body, post URL.
6. Continue to dedup + enrich.

Cost: ~$0.025/day for 4-5 queries.

---

## Mode 3 — LinkedIn jobs-board monitor (daily)

**Hypothesis:** Still want coverage of formal listings — some startups post here first.

Endpoint: `tikhub /api/v1/linkedin/web/search_jobs` (**$0.006/call**) — use **v1**, not v2. (The v2 endpoint at `/api/v1/linkedin/web_v2/search_jobs` returns 400 on otherwise-valid input at time of writing — verified 2026-06.) Params go in **`--query`**, NOT `-i`.
- Required: `keyword` (singular!)
- Optional: `date_posted` ("anytime"/"past_month"/"past_week"/"past_24_hours"), `sort_by` ("recent"/"relevant"), `remote` ("onsite"/"remote"/"hybrid"), `experience_level` ("internship"/"entry_level"/"associate"/"mid_senior"/"director"/"executive" — **one value per call**; verified 2026-06), `job_type` ("full_time"/"part_time"/"contract"), `geocode` (city geocode), `page`, `easy_apply`
- **Seniority**: when the profile's `levels` is set (and the role isn't founding), send `experience_level`. It's the only server-side seniority filter across the three sources — wire it here. One bucket per call, so loop over selected `levels` and merge. Omit it for founding roles or empty `levels`.
- Note: location is **`geocode`** (not free text). Either get geocode via the "Search Geocode Location" endpoint, or filter results client-side by `.location` string after the fact.

```bash
monid run -p tikhub -e /api/v1/linkedin/web/search_jobs \
  --query '{"keyword":"<role keywords>","experience_level":"mid_senior","date_posted":"past_24_hours","sort_by":"recent","remote":"remote"}' \
  --wait 30 -j -o li_jobs.json
```

**For the default 2-day window**: there is no `past_2_days` enum value — `date_posted` only accepts `past_24_hours` / `past_week` / `past_month` / `anytime`. Pick `past_week` and then **filter client-side** to `listed_at >= now - 2 days`. Don't widen the user's window.

Response shape: `{output: {data: [{id, title, url, listed_at, location, company:{name,verified,url}, is_easy_apply}, ...], has_more, page, total}}`. The unverified `company.verified` flag is a useful "small company" proxy.

Steps:
1. Build 2-3 queries: one per role × location combination. Use `date_posted: "past_week"` then **filter client-side** to `listed_at >= now - 2 days`. When `levels` is set (and role isn't founding), add `experience_level` and run one query per selected level, then merge — each adds a $0.006 call, so keep the level count small.
2. **Role-level filter** (CRITICAL): drop titles that don't match the user's level. If profile says `product manager`, drop "Senior PM", "Staff PM", "Lead PM", "Principal PM", "Group PM". The `experience_level` param pre-narrows server-side; this LLM pass is still the backstop. See Role-level discipline section above.
3. Cap total kept at `linkedin_jobs_cap` (default 25/day).
4. **Filter by industry/focus** (match company industry to profile `industries` when present in result).
5. **Stage proxy**: if result includes company size, treat `<50 employees` as startup-friendly; larger orgs deprioritized unless `stages` includes "Series B+" / "any".
6. Apply exclusions.
7. Continue to dedup + enrich.

Cost: ~$0.005/day for 2-3 queries (add ~$0.006 per extra `levels` entry, since each is a separate call).

---

## Cross-cutting: dedup + enrich

### Dedup across the three sources
A founder often posts the same role on X + LinkedIn + the jobs board. Dedup by **`(company_domain, role_title)`** tuple. Keep the entry with the strongest signal (founder X post > LinkedIn post > jobs-board entry), but list ALL source links on the deduped entry so the user can see every channel.

### Enrich top N (default 10 per `enrich_cap`)
For each surviving role, produce:
- **Company**: name + URL (from post text, poster bio, or job listing)
- **Company one-liner**: WebFetch the company site for ≤20 words (free)
- **Stage signal** (only if known — never guess): from LinkedIn job listing's company size, or optionally `pdl /v5/company/enrich` ($0.10) for funding/headcount. Skip silently if 404.
- **Role**: title + 2-3 key responsibilities + must-haves (extract from post text or job listing)
- **Hiring poster**: name + X/LinkedIn URL + role at company (from the source account or listing's "posted by")
- **How to apply**: DM / email / link (parse from post)
- **Comp** (only if explicitly mentioned)
- **Match score (1-10)**: weighted blend of role-fit, skills-overlap, industry-match, location-fit, stage-match. Use simple LLM judgment; don't overengineer.

Enrichment cost: ~$1/day (WebFetch free + optional PDL company × ≤10).

---

## Output: the digest

Write one markdown file per run to `${XDG_DATA_HOME:-$HOME/.local/share}/monid/job-finder/digests/YYYY-MM-DD.md`, grouped by source priority and match score:

```markdown
# Job digest — 2026-06-07

## 🔥 Strong matches (score ≥ 8)

### [Role Title] — [Company]
- **Company / one-liner**: <name> — <≤20-word description>
- **Stage** *(only if known)*: <e.g. "Seed, 12 employees" or "no data — likely very early">
- **Hiring**: @founderhandle (<their role>) — [link to original post]
- **How to apply**: DM / email <addr> / link <url>
- **Comp**: <only if mentioned>
- **Why match**: <skills X + Y match; role aligns; location ✓>
- **Sources**: X post · LinkedIn post · LinkedIn job (whichever appeared)

## ✅ Good matches (5-7)
[shorter format: role + company + one-liner + link]

## ❓ Maybe / weak signal (3-4)
[handles + one-liner only, no enrichment — user can promote any for full enrich]

## Stats
- X posts scanned: N · LinkedIn posts: N · LinkedIn jobs: N
- Unique roles after dedup: N
- Enriched: N (cap)
- Total spent this run: $X.XX
```

---

## Cadence: manual + scheduled

- **Manual / ad hoc**: user invokes the skill anytime. Read `last_run.json`; tell them what's due. Examples:
  - "find me jobs" (no time hint) → all 3 modes, **default past 2 days**
  - "find me jobs today" → all 3 modes, past 24h
  - "check past 3 days" → all 3 modes with custom time window (translate to `since:YYYY-MM-DD`)
  - "just scan X for jobs" → Mode 1 only
- **Scheduled**: when the user is happy with the digest quality and wants it every day automatically, **proactively offer to set up a daily cron**. Three options, in order of universality:

  1. **OS cron** (most portable — recommend by default). On macOS/Linux:
     ```bash
     # Open the crontab editor
     crontab -e
     # Add a line — runs daily at 8am local, writes a digest, logs cost:
     0 8 * * * /usr/local/bin/claude --print "/job-finder" >> "${XDG_DATA_HOME:-$HOME/.local/share}/monid/job-finder/cron.log" 2>&1
     ```
     Adjust the `claude` path (`which claude`) and the time. On Windows, use Task Scheduler with the same one-shot command.

  2. **`/schedule` skill** (if the user has the gstack `schedule` skill installed): faster setup, runs as a remote Claude agent. Say "schedule /job-finder daily at 8am" and it'll wire it.

  3. **`/loop` skill** (gstack `loop`): runs in the foreground at an interval. Better for "keep poking every N hours during this session" than a daily background job.

Whichever path they pick, store the schedule choice in `${XDG_DATA_HOME:-$HOME/.local/share}/monid/job-finder/last_run.json` so manual + scheduled runs share the same digests and don't double-charge for overlapping windows.

Ad hoc and scheduled runs are independent — running ad hoc over a custom window does NOT reset the daily schedule's clock.

> **When to suggest the cron**: after a successful digest run that the user reacts positively to ("nice", "this is useful", "great"). Don't ask on the very first run — let them see the output quality first.

---

## Cost discipline

| Mode | Cost/day |
|---|---|
| Mode 1 (X searches) | ~$0.01 |
| Mode 2 (LinkedIn posts) | ~$0.025 |
| Mode 3 (LinkedIn jobs, v1 @ $0.006/call × 2-3 queries) | ~$0.018 |
| Enrichment (top 10) | up to $1.00 |
| **Daily total** | **~$1.05** |

- Report `cost.value` per run; show per-digest total.
- Before a run with estimated spend > $5, check `monid balance` and confirm with the user.
- Enrichment is capped at top 10. Overflow roles listed unenriched; enrich-on-request by company/role name.
- Re-run `monid discover` occasionally to catch cheaper/better endpoints, but default to the validated set below.

---

## Reference: validated endpoints

| Purpose | Provider / Endpoint | Cost | Params |
|---|---|---|---|
| X search (jobs language) | `tikhub /api/v1/twitter/web/fetch_search_timeline` | $0.0015/call | `--query` |
| X profile (classify source) | `tikhub /api/v1/twitter/web/fetch_user_profile` | $0.0015/call | `--query` |
| LinkedIn post search | `tikhub /api/v1/linkedin/web/search_posts` | $0.006/call | `-i` |
| LinkedIn jobs search | `tikhub /api/v1/linkedin/web/search_jobs` (v1; v2 is broken) | $0.006/call | `--query` |
| Company firmographics (optional) | `pdl /v5/company/enrich` | $0.10/call | `-i` |

X advanced search operators (in `keyword`): `since:`/`until:`, `min_faves:`, `-filter:replies`, `lang:en`, `OR`, quoted phrases. `search_type`: `Latest` (chronological) or `Top`.

> Founder identity for posts on X is sourced free from the X profile. Avoid `pdl /v5/person/enrich` ($0.30) — too early-stage to reliably match, and the post text already gives us what we need.
