---
name: lead-list
version: 0.1.0
description: Turns an ideal customer description into a short list of companies, one decision-maker at each, and a verified work email. Use when the user wants a short list of target companies with one decision-maker and a verified work email at each. Also for "build me a lead list", "find the head of X at companies like Y", "who should I email at Series A AI startups". An ideal customer description in, leads.csv plus summary.md out, with the bill.
---

# Lead list from an ideal customer description

In: one sentence describing the ideal customer (company type, stage, location, target role). Out: `leads.csv` with company, decision-maker, LinkedIn URL, work email and verification status, a short `summary.md`, and the bill with cost per verified lead.

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

1. Ideal customer: company type, funding stage (optional), location, and the target role. No default; this is the one thing the user must give. Example: "Series A AI infra companies in the US, head of platform".
2. How many companies. Default 5. The user can ask for more; cost scales roughly linearly.
3. Spend cap. Default $1.00.

## Budget

All prices are as of 2026-11-22 and can change. Run `monid inspect` on each endpoint before its first run in a session and use the price it shows.

- Default run (5 companies, funding stage given): about $0.55. The verified run cost $0.573 for 5 leads, including $0.039 of exploratory calls.
- Per company: $0.06 (company row) + up to $0.01 (people) + $0.0245 (email) + $0.01225 (verification), about $0.11.
- Without a funding stage the company step is one $0.026 call instead of $0.06 per company, so 5 companies come to about $0.26.
- Before the first paid call, tell the user the estimated cost. Keep a running total from the billed cost of each run. Stop and ask before going over the cap.

## Steps

1. Turn the sentence into filters. Split it into: what the company does (a descriptive phrase), funding stage, location, target role. Write down a fallback ladder for the role before searching, for example "head of platform" then VP or head of engineering, then CTO, then a technical co-founder. Small companies often have no one with the exact title: in the verified run no company had the exact title asked for, and every lead came from a lower rung. Tell the user which rung each lead matched.

2. Find companies. Pick one route.
   - Funding stage given: `fundable /companies`, $0.06 per result. First resolve the location with `fundable /location/search` (free, query params `name`, optional `type` of `CITY`, `STATE`, `REGION`, `COUNTRY`) and use the returned `permalink`. Then send body `{"company": {"search_query": "<what the company does>", "locations": ["<permalink>"]}, "latest_deal": {"financing_types": [{"type": "<STAGE>"}]}, "page_size": <number of companies asked for>}`. `<STAGE>` is the stage the user asked for, as an enum value (`SEED`, `SERIES_A`, `SERIES_B`, ...); never send a stage the user did not ask for. If the stage asked for is not among the values `monid inspect` lists (pre-seed, for example), read the schema for how it is expressed and do not substitute the nearest stage; only `SEED` and `SERIES_A` were run. Billing is per row returned, so `page_size` is your spend control: set it to the number of companies the user asked for, and check that the count times the per-row price `monid inspect` shows today ($0.06 on 2026-11-22), plus the per-company steps, fits the cap before sending. Only `page_size` 3 and 5 were run; for a larger list read the page-size limit and paging fields in `monid inspect` first. Keep `name`, `domain`, `linkedin`, `num_employees`, `short_description`, `total_raised`, `location.country.name`, and `latest_deal.type`, `latest_deal.total_round_raised`, `latest_deal.date`.
   - No funding stage: `apollo /mixed_companies/search`, $0.026 per call for up to 100 rows. Query params `q_organization_keyword_tags[]`, `organization_locations[]`, `organization_num_employees_ranges[]` (for example `"11,50"`), `per_page`. Keep `name`, `primary_domain`, `linkedin_url`. It returns no description and no funding stage, and keyword matching is loose, so read each row and drop companies that do not fit before spending on them.
   - Fundable is worth the higher price when stage matters, because Apollo has no stage filter, only funding amount and date ranges.

3. Check the company rows. Dedupe by domain. Drop rows with no domain. Flag any row whose `latest_deal.date` is more than 2 years old: the stage filter matches the latest recorded round, so a company whose seed round was in 2017 still comes back as "seed" and has probably moved past that stage. Tell the user how many rows are stale; if most are, check `monid inspect` for a date filter on `latest_deal` and rerun with a floor before spending on people. Flag any row where `total_raised` is far larger than `latest_deal.total_round_raised` for an early stage; the stage label may be wrong. Keep flagged rows but say so in `notes`.

4. Find the decision-maker. For each company call `outbound.dev /companies/people`, $0.001 per person returned. Body: `{"company": {"domain": "<domain>"}, "filters": {"job_title_role": ["engineering"], "job_title_levels": ["cxo", "vp", "director"]}, "limit": 10}`.
   - Choose `job_title_role` to match the target role's function. There is no compliance, risk or security value; compliance titles came back tagged `legal`. Get the accepted values from `outbound.dev /people/filters` (free, optional query param `field`). `job_title_levels` values include `cxo`, `vp`, `director`, `owner`, `manager`, `senior`.
   - Always send both the role and the levels filter. With levels alone, the run returned investors, advisors and interns.
   - People are in `output.data` (an array). `output.company` shows which company the domain resolved to; if its name differs from the name in step 2, say so in `notes`.
   - Keep `full_name`, `first_name`, `last_name`, `job_title`, `job_title_levels`, `job_company_name`, `job_company_website`, `linkedin_url`, `location_name`. It returns no emails.

5. Pick one person per company. Rank the returned people against the role ladder from step 1 and take the best match. Reject a person when `job_company_website` is not the company's domain, when the title is investor, advisor, board member or consultant, or when the last name is abbreviated ("Yaniv S."), because the email step needs a full name. Record which rung of the ladder the person matched. Prefix `linkedin_url` with `https://www.` (it comes back as `linkedin.com/in/...`).

6. Find the work email. `hunterio /email-finder`, $0.0245 per address found. Query params `first_name`, `last_name`, `domain`. Keep `email`, `score`, `position`, `company`, `linkedin_url`, `accept_all`, `verification.status`, `verification.date`.
   - Sanity check: the returned `position` and `linkedin_url` should agree with the person from step 5. If they point at someone else, do not use the address.
   - If `position` and `linkedin_url` are both null (a pattern-generated address), keep it only if the verifier in step 7 returns `valid`, and say in `notes` that the match rests on name and domain.
   - `email: null` means not found. Leave the email blank for that lead; do not guess a pattern.

7. Verify. `hunterio /email-verifier`, $0.01225 per verdict. Query param `email`. Keep `status` (`valid`, `invalid`, `accept_all`, `webmail`, `disposable`, `unknown`), `score`, `accept_all`, `smtp_check`.
   - Count a lead as verified only when `status` is `valid`. Report `accept_all` separately: the domain accepts any address, so the mailbox is not confirmed.
   - Drop `invalid` addresses from the email column and say so in `notes`.
   - In the verified run, the finder's own `verification.status` matched the verifier in 5 of 5. Run the verifier anyway; skipping it was not tested.

8. Write the deliverable and report the bill.

## If a step fails

- Company search returns too few rows: loosen the wording of the description and rerun, then check every returned row against what the user originally asked for and drop the ones that no longer fit before paying for people or emails. If keeping the original company type gives too few, ask the user before relaxing it. Do not drop or widen the location on your own: the user asked for that place, so either keep it and report the shortfall, or ask the user to approve a wider area before spending on it. Fundable ignores a location or industry value that is not an exact permalink and returns zero rows, so resolve it first.
- People call returns no usable person: retry once with a broader `job_title_role` (values from `outbound.dev /people/filters`). If still nothing, keep the company with blank person fields and say so in `notes`.
- Email not found, or any endpoint errors: there is no verified fallback for the email step. Run `monid discover -q "find work email by name and company domain"` (or the matching capability phrase for the failed step), then `monid inspect` the result before running it. Never guess parameters.
- On `RATE_LIMITED`, wait the stated seconds and retry. Check `monid runs list` before re-running a paid call.
- A run can show status `COMPLETED` while the provider call failed. Check `providerResponse.httpStatus` in the run result before using the output.

## Pitfalls

- Check the billed cost on each run; do not assume from the listed price. A 200 with empty results can still be billed on some endpoints.
- A returned person is not proof of a match. Always compare company domain and title against what you asked for before paying for the next step.
- `outbound.dev /companies/people` treats `job_title_levels` loosely: 10 "senior" results for one company were all investors until a `job_title_role` filter was added.
- A `job_title` text filter on `/companies/people` returned zero people. Use role and levels, then rank titles yourself.
- Some people come back with an abbreviated last name. They cannot be used for the email step.
- Funding stage labels can be off: one "Series A" result had $22.75B total raised.
- Apollo keyword search returned an unrelated consumer app for "ai infrastructure". Read the rows before using them.
- One alternative work-email endpoint answered with a 502 "monthly credit limit reached" (billed $0). Have discover ready rather than a fixed second provider.
- `monid run -o <file>` saves only the output. The run id and billed cost are in the `-j` output, so save that instead. Billed cost is `cost.value` (USD) when present, otherwise `billing.reportedCost.value` divided by 1,000,000; both shapes occur.
- The verifier can return the finder's cached verdict (same `verification.date`). It still adds `smtp_check` and `accept_all`.

## Deliverable

- `leads.csv`, one row per company, columns: `company`, `domain`, `person`, `title`, `linkedin_url`, `work_email`, `verification_status`, `company_source`, `person_source`, `email_source`, `verification_source`, `notes`. Each source column holds the provider and endpoint the field came from. `notes` holds funding facts, which rung of the role ladder matched, and any flag.
- `summary.md`: the request as understood, the filters used, how many companies, people, emails and verified emails, anything dropped or flagged and why, and the bill.
- Work emails for the named business role only. Do not add personal emails or phone numbers.
- Chat reply: the table (company, person, title, email, status), the count of verified leads, total cost and cost per verified lead, and the file paths.
- This skill does not send anything. If the user wants outreach, write drafts to a file and send only after they read the drafts and confirm.

## Report the bill

End with a table of every call, including free and failed ones, using the billed cost from each run result, not the listed price.

| # | Endpoint | What it returned | Billed |
|---|---|---|---|
| 1 | fundable /location/search | 1 permalink | $0.00 |
| 2 | fundable /companies | 5 companies | $0.30 |
| 3 | outbound.dev /companies/people | 10 people at company A | $0.01 |
| ... | ... | ... | ... |

Then give the total, the number of leads with `valid` status, and cost per verified lead (total divided by `valid` leads). If no lead verified, say so instead of dividing.
