---
name: recruiter-email
version: 0.1.0
description: Turns one job posting into the recruiter and the hiring manager behind it, each with a work email and its verification status, plus a first line to send. Use when the user wants to reach the people hiring for a role instead of applying through the queue. Also for "who is hiring for this job", "get me the recruiter's email", "find the hiring manager for this posting", "reach the recruiter directly". A job posting URL (or a company plus a role) in, recruiters.csv plus summary.md and drafts.md out, with the bill.
---

# Recruiter email from a job posting

In: one LinkedIn job posting URL, or a company name plus the role. Out: `recruiters.csv` with the posting, the talent team and the hiring manager, work emails with their verification status, `summary.md`, `drafts.md` with a first line for each person, and the bill. The recruiter usually comes back provider-verified; the hiring manager often does not have an address on file and ends with a pattern address and a verifier verdict instead.

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

1. The posting: a LinkedIn job URL (`linkedin.com/jobs/view/<id>`), or a company name plus the role title. No default; this is the one thing the user must give.
2. Who to reach. Default: one recruiter and the hiring manager. The user can ask for the whole talent team.
3. One sentence on what the user did that matches the role's must-haves. Used only for the drafts; if they skip it, the drafts carry a bracketed placeholder.
4. Spend cap. Default $1.00.

## Budget

All prices are as of 2026-11-23 and can change. Run `monid inspect` on each endpoint before its first run in a session and use the price it shows.

- Default run (one posting, one recruiter, one hiring manager): about $0.09. The verified run cost $0.115 for both people, including $0.026 for a company lookup the agent only needs when the domain is unclear; the cold test on a second posting cost $0.0889 on the same path without the lookup.
- The short path (posting, talent team, one verified recruiter email) is three calls and $0.02615.
- Per revealed person: $0.026 (Apollo match). If Apollo has no email for that person, add $0.0245 (Hunter finder) and $0.01225 (Hunter verifier).
- Before the first paid call, tell the user the estimated cost. Keep a running total from the billed cost of each run. Stop and ask before going over the cap.

## Steps

1. Read the posting. If the user gave a LinkedIn job URL, take the digits after `/jobs/view/` as `job_id` and call `litescrape /linkedin/job`, $0.00015, query param `job_id`. Keep `job.title`, `job.company`, `job.location`, `job.posted_relative`, `job.applicants`, `job.salary`, `job.employment_type`, `job.company_url` (the company's LinkedIn page) and `job.description`. If the user gave a company and a role instead, call `litescrape /linkedin/jobs`, $0.00015, query params `q` (the role), `location` (optional), `page` 1. It returns up to 10 postings with `job_id`, `title`, `company`, `location`, `posted_at` and `link`; it does not filter by company, so read the rows and pick the one at the right company, then fetch it with `/linkedin/job`. Search results carry `description: null`; the detail call has the text and the applicant count.

2. Resolve the company domain. The posting gives the company name and its LinkedIn page, not a domain. If the company's website is obvious from the posting text or the LinkedIn slug (for example `linkedin.com/company/getmaintainx` and `getmaintainx.com`), or the company is well known enough that you are certain of its domain, use it and say in `notes` that it was inferred; the match in step 5 returns `organization.primary_domain`, which confirms it at no extra cost. If not, call `apollo /mixed_companies/search`, $0.026, query params `q_organization_name` (the company name), `per_page` 3. It returns `organizations[]` with `name`, `primary_domain`, `website_url`, `linkedin_url` and `id`; partial name matches come back too (the verified run returned "MaintainX Solutions LTD" and "maintain[XR]" beside MaintainX), so pick the row whose `linkedin_url` matches the posting's `company_url` and keep its `primary_domain`.

3. Find the talent team. Call `apollo /mixed_people/api_search`, $0, query params `q_organization_domains_list[]` = [domain], `person_titles[]` = ["recruiter", "technical recruiter", "talent acquisition", "talent partner"], `include_similar_titles` true, `per_page` 25. The response's `total_entries` says how big the team is; if it is larger than one page, say so in `notes`. Each row is a preview: `id`, `first_name`, `last_name_obfuscated`, `title`, `has_email`, `last_refreshed_at`, `organization.name`. No email, no LinkedIn URL and no full last name until step 5. Rank by fit to the posting: demote titles that name a different function (GTM, Legal, Finance); promote titles that name the posting's function (technical, design, product); treat Talent Partner, Senior and Staff variants of the same title as equal and order them by `last_refreshed_at`, newest first. The preview has no location, so if the posting is tied to one office say in `notes` that the recruiter's city is only known after the match. Drop rows with `has_email` false from the reveal list; keep them in the CSV with a blank email.

4. Find the hiring manager. Same endpoint and domain, `person_titles[]` set to the leaders of the posting's function, for example ["head of design", "design manager", "director of product design", "vp of design"] for a product design role, with `include_similar_titles` true. $0. Take the one whose title owns the team the posting describes. When two leaders fit and only one has `has_email` true, prefer that one: it saves the Hunter fallback in step 6. The verified run returned a Head of Design and a Design Operations Manager.

5. Reveal the recruiter. Call `apollo /people/match`, $0.026 per call, query param `id` (the preview id). Keep `person.name`, `person.first_name`, `person.last_name`, `person.title`, `person.linkedin_url`, `person.email`, `person.email_status`, `person.match_confidence`, `person.city`, `person.state`, `person.organization.primary_domain` and the current `employment_history[]` entry (`start_date`, `title`). Count the address as verified only when `email_status` is `verified`. For the recruiter, only match previews with `has_email` true: a match that returns `email: null` is still billed $0.026 (observed in the verified run and the cold test).

6. Reveal the hiring manager. Same call, and for this person match even when the preview said `has_email` false: the $0.026 buys the full name (the preview only has an initial) that the fallback needs. If the match returns `email: null`, call `hunterio /email-finder`, $0.0245 per address found, query params `first_name`, `last_name`, `domain`. Keep `data.email`, `data.score`, `data.accept_all`, `data.source_type`, `data.verification.status`. A `source_type` of `generated` means a pattern guess, so verify it: `hunterio /email-verifier`, $0.01225 per definitive verdict, query param `email`. Keep `data.status` (`valid`, `invalid`, `accept_all`, `webmail`, `disposable`, `unknown`), `data.score`, `data.smtp_check`, `data.accept_all`. Count the address as valid only when `status` is `valid`. If the verifier returns `accept_all` or `unknown`, keep the address in `work_email`, set `email_status` to the verifier's status, write "pattern address, not confirmed" in `notes`, and say in `summary.md` that the domain accepts all mail so only a send can confirm it. If it returns `invalid`, blank the address. The finder's own `accept_all` flag and the verifier's can disagree (true from the finder, false from the verifier in the verified run), so report the verifier's.

7. Draft the first line for each person. Four sentences, written from the posting's own words: the role and when it was posted, the user's matching sentence from Ask first (or a bracketed placeholder if they skipped it), a link, and one question. For an address the verifier did not confirm, put a one-line warning above the draft. Write them to `drafts.md`. Never send anything; the user reads the drafts and sends them from their own mailbox.

8. Write the deliverable and report the bill.

## If a step fails

- The job URL is not a LinkedIn posting: run `monid discover -q "read a job posting page"` and `monid inspect` the result before running it; otherwise ask the user for the company and the role and take the search route in step 1.
- Company search returns several plausible rows: match on `linkedin_url` against the posting's `company_url`; if none matches, ask the user for the website instead of guessing.
- The talent search returns zero people: retry once with `person_titles[]` = ["people operations", "human resources", "talent"] and `include_similar_titles` true. If still nothing, go to the hiring manager only and say so in `notes`.
- Hunter returns `email: null`: leave the email blank, keep the person's LinkedIn URL, and say so in `notes`. Do not guess a pattern yourself. Try the next leader in the hiring-manager search whose preview has `has_email` true before spending on Hunter for a second person.
- On `RATE_LIMITED`, wait the stated seconds and retry. Check `monid runs list` before re-running a paid call.
- A run can show status `COMPLETED` while the provider call failed. Check `providerResponse.httpStatus` in the run result before using the output.

## Pitfalls

- Check the billed cost on each run; do not assume from the listed price. A 200 with empty results can still be billed on some endpoints.
- `apollo /people/match` bills $0.026 even when it returns no email, as long as it attaches the person to a known company. Read `has_email` on the preview before paying.
- `apollo /mixed_people/api_search` previews obfuscate the last name ("Pa***k"). The Hunter fallback needs the full name, so it can only run after a match.
- `litescrape /linkedin/jobs` matches `q` loosely and ignores the company; a search for one role at one company returns ten postings from ten companies. Pick by `company`.
- `litescrape /linkedin/job` returned `posted_at: null` with `posted_relative: "17 hours ago"` and `applicants: "Over 200 applicants"`: both are strings, keep them as text.
- The finder's `accept_all` and the verifier's `accept_all` can disagree on the same address. Report the verifier's and keep the finder's `score` as a second opinion. Apollo's `email_domain_catchall` is per record and disagreed with itself across two people on one domain in the cold test; do not use it for the domain verdict.
- `apollo /mixed_people/api_search` returns at most `per_page` rows; the cold test's first page showed 10 of 14 talent people. Read `total_entries`.
- `monid run -o <file>` saves only the output. The run id and billed cost are in the `-j` output, so save that instead. Billed cost is `cost.value` (USD) when present, otherwise `billing.reportedCost.value` divided by 1,000,000; both shapes occur.

## Deliverable

- `recruiters.csv`, one row per person, columns: `company`, `domain`, `posting_title`, `posting_url`, `applicants`, `person`, `title`, `role` (`recruiter` or `hiring_manager`), `linkedin_url`, `work_email`, `email_status`, `email_source`, `verification_source`, `cost`, `notes`. Each source column holds the provider and endpoint the field came from. `notes` holds how the domain was resolved, which title ranked first and why, and any blank.
- `summary.md`: the posting as read (title, company, location, age, applicants, salary), who was found, who was revealed and with what status, anything blank and why, and the bill.
- `drafts.md`: one four-sentence first line per revealed person, with the address it is for. Nothing is sent by this skill.
- Work emails for named business roles only. Do not add personal emails or phone numbers.
- Chat reply: the table (person, title, role, email, status), total cost, and the file paths.

## Report the bill

End with a table of every call, including free and failed ones, using the billed cost from each run result, not the listed price.

| # | Endpoint | What it returned | Billed |
|---|---|---|---|
| 1 | litescrape /linkedin/job | the posting, 200+ applicants | $0.00015 |
| 2 | apollo /mixed_people/api_search | 6 talent people | $0 |
| 3 | apollo /mixed_people/api_search | 2 design leads | $0 |
| 4 | apollo /people/match | recruiter, email verified | $0.026 |
| 5 | apollo /people/match | hiring manager, no email, billed | $0.026 |
| 6 | hunterio /email-finder | hiring manager address, score 85 | $0.0245 |
| 7 | hunterio /email-verifier | valid, score 89 | $0.01225 |
| | Total | | $0.0889 |
