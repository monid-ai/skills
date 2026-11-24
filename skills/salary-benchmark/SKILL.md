---
name: salary-benchmark
version: 0.1.0
description: Turns a role, a city and an offer into a pay benchmark: the market median and range, where the offer sits, the best paying cities and states, and the level-by-level pay ladder at the companies the user names. Use when the user wants to know what a job pays, whether an offer is fair, or how companies compare by level. Also for "what do software engineers make in Seattle", "is $150K a good offer", "compare Google and Meta entry level pay", "salary benchmark". A role plus an optional city, offer and company list in, benchmark.md plus ladders.csv out, with the bill.
---

# Salary benchmark for a role, a city and an offer

In: a job title, and optionally a city, an offer amount and up to seven companies. Out: `benchmark.md` (the role's median and range nationally and in the city, the offer scored against both, top paying cities, states and companies, and a ladder table per company) and `ladders.csv` (every level at every company named, with quartiles from the samples), with the bill.

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

Ask once, and accept "go" for the defaults.

1. The role, as a job title ("Software Engineer", "Product Manager"). No default; this is the one thing the user must give.
2. The city, as "City, ST" ("San Francisco, CA"). Default: none, United States only.
3. The offer, a yearly amount in dollars. Default: none; without it the benchmark skips the verdict.
4. Companies to ladder, up to seven, by name. Default: none; without them step 5 is skipped. The spend cap, default $1.00.

## Budget

All prices are as of 2026-11-24 and can change. Run `monid inspect` on each endpoint before its first run in a session and use the price it shows.

- Default run (role, one city, an offer, seven companies): $0.11. The verified run cost $0.11 for exactly that, plus $0.01 for a location test that is now a pitfall, not a step.
- Role only: $0.02. Role plus city: $0.04. Each company ladder: $0.01.
- Before the first paid call, tell the user the estimated cost. Keep a running total from the billed cost of each run. Stop and ask before going over the cap.

## Steps

1. The national market. `indeed /get_salary_info`, $0.02, query param `job_title`. Save the output to a file (it is about 340 KB, most of it page chrome) and read it with jq or a script; never print it. Keep, from `data.localSalaryAggregate` (equal to `nationalSalaryAggregate` when no location was given): `salaries.salaries.YEARLY` (`estimatedMedian`, `estimatedMin`, `estimatedMax`, `mean`, `numDataPoints`), `salaryMapInfo.salaryInfoMap` (one entry per state: `yearlyAvgSalary`, `numSamples`, `percentChangeFromBase`), and from `data`: `topPaidCities.cities[]` (`location.displayName`, `salary.salaries.YEARLY.estimatedMedian`, `salary.salaries.YEARLY.numDataPoints`; ignore the HOURLY block, whose count is 0 for every city) and `topPayingCompanies[]` (`name`, `salary.yearly.mean`, `salary.yearly.count`). Drop cities whose yearly `numDataPoints` is 0 and companies with no `salary.yearly`. The company list can carry one company under two employer keys (Meta twice in the cold test); keep both rows and say so.

2. The city market, if a city was given. Same endpoint, $0.02, query params `job_title` and `location` ("San Francisco, CA"). Keep the same fields. `data.localSalaryAggregate` is now the city and `data.nationalSalaryAggregate` the country, so one call carries both; `topPayingCompanies` is now the city's list.

3. Score the offer, if one was given. Percent against the national median and the city median, and where it falls in each typical range (`estimatedMin` to `estimatedMax`). Write it as two numbers with signs, for example "+9.7% vs the US median, −19.2% vs San Francisco". Say that Indeed figures are reported salary (base-like) and the Levels.fyi ladders in step 5 are total compensation (base, stock and bonus): compare the offer to Indeed, and to the ladders only if the offer amount is total compensation.

4. Cities and states. From the national call, list the top paying cities with their median and percent over the national median, and the five highest state averages from `salaryInfoMap` among states with at least 20 `numSamples`, showing the count. Say that state figures are averages and city figures are medians; do not mix them in one list.

5. Company ladders, one call per company. `levels.fyi /get_salary_data`, $0.01, query params `company_slug` and `job_family_slug`. Slugs are lowercase and hyphenated: `google`, `meta` (not `facebook`), `software-engineer`, `product-manager`, `data-scientist`. Keep, from `data.averages[]` (one entry per level, lowest first): `primaryLevelName`, `secondaryLevelName`, `total`, `base`, `stock`, `bonus`, `count`, `count_last_12_months`, `yoeMedian`, and `samples[].totalCompensation` (10 to 26 points per level); from `data.percentiles.tc`: `p25`, `p50`, `p75` for the whole job family. For each level sort the samples and compute the 25th percentile, median and 75th percentile yourself; `total` is the provider's average, not the median. Mark the entry level (first entry) and the senior IC level: the first level whose `primaryLevelName` contains "Senior" but not "Director", "VP" or "Group"; if none does, use the third level and say so. Flag any row with fewer than 10 samples.

6. Write the deliverable and report the bill.

## If a step fails

- `indeed /get_salary_info` returns no `YEARLY` block: the title is one Indeed reports hourly or does not know. Retry once with a plainer title ("Nurse" instead of "RN II"); if still nothing, say so and continue with the ladders.
- A company slug is not found (empty `averages` or a 404 in `providerResponse`): try the company's common short name as the slug once (`meta`, `alphabet` is `google`); if still nothing, run `monid discover -q "company salary levels by job family"`, `monid inspect` the result, and run it; never guess parameters.
- A `job_family_slug` returns no levels: the family is named differently at that company. Run `monid discover -q "levels.fyi job families for a company"`, inspect, and read the slugs before retrying.
- On `RATE_LIMITED`, wait the stated seconds and retry. Check `monid runs list` before re-running a paid call.
- A run can show status `COMPLETED` while the provider call failed. Check `providerResponse.httpStatus` in the run result before using the output.

## Pitfalls

- Check the billed cost on each run; do not assume from the listed price. A 200 with empty results can still be billed on some endpoints.
- `levels.fyi /get_salary_data` ignored `location` in the verified run: `location=san-francisco-bay-area` came back with `percentiles.locationName: "United States"` and `location_meta: null`, and was billed. Treat every ladder as US-wide and do not pay for a location variant.
- Indeed's `topPayingCompanies[].salary.main` can be an hourly figure (`type: "HOURLY"`, Mercor at $92 in the verified run) while `salary.yearly` holds the yearly one. Read `yearly`, and skip companies that have none.
- Indeed's `topPaidCities` can include a city with `numDataPoints: 0` at the top (Camarillo, CA in the verified run, inferred). Drop those rows.
- State figures (`yearlyAvgSalary`) are averages; the role and city figures (`estimatedMedian`) are medians. Label them.
- The Indeed output is about 300 to 350 KB per call because it carries the page's locale strings and experiment flags. Save with `-o` and read only the paths above. Neither endpoint takes a body, so `-i` is not needed.
- Levels.fyi level samples run from about 3 to 30 points per level (as few as 3 at thin senior levels), so the quartiles are rough; say how many samples each row rests on and flag rows under 10. The provider's `total` is an average and sits above the median for skewed levels.
- `data.median` in the Levels.fyi output is one full individual submission (uuid, city, education, offer date, exact pay). Do not copy it into the deliverable; use `percentiles.tc` and the per-level `samples` only.
- `monid run -o <file>` saves only the output. The run id and billed cost are in the `-j` output, so save that instead. Billed cost is `cost.value` (USD) when present, otherwise `billing.reportedCost.value` divided by 1,000,000; both shapes occur.

## Deliverable

- `benchmark.md`, sections: the role (national and city median, range, data points), the offer (two percentages and where it sits in each range, or "no offer given"), cities and states, top paying companies (yearly only, with counts), company ladders (one row per company: entry level and median, entry 25th to 75th percentile, senior level and median, with sample counts), a one-line note that Indeed figures are reported salary and ladders are total compensation, and the bill.
- `ladders.csv`, one row per level per company, columns: `company`, `level`, `level_alt`, `samples`, `p25`, `median`, `p75`, `avg_total`, `avg_base`, `avg_stock`, `avg_bonus`, `yoe_median`, `reports_12mo`.
- Public, aggregate figures only. No individual submissions are identified; the samples are redacted by the provider.
- Chat reply: the role's median and range, the offer verdict in one line, the ladder table, total cost, and the file paths.

## Report the bill

End with a table of every call, including free and failed ones, using the billed cost from each run result, not the listed price.

| # | Endpoint | What it returned | Billed |
|---|---|---|---|
| 1 | indeed /get_salary_info Software Engineer | US median, range, states, cities, companies | $0.02 |
| 2 | indeed /get_salary_info Software Engineer, San Francisco, CA | SF median, range, SF companies | $0.02 |
| 3 to 9 | levels.fyi /get_salary_data, seven companies | levels, samples, percentiles | $0.07 |
| | Total | | $0.11 |
