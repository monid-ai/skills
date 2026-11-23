# Verify run: recruiter-email

Date: 2026-11-23 (UTC). Request used: "find who is hiring for https://www.linkedin.com/jobs/view/4468033424/ and get me their verified work email" (one recruiter and the hiring manager, cap $1.00).

The posting was picked from a `litescrape /linkedin/jobs` search for "Senior Product Designer" in New York (call 1), the freshest row: MaintainX, "Senior Product Designer, AI", posted 17 hours earlier, "Over 200 applicants", $130,000 to $230,000 a year, full-time.

Addresses in this folder are masked (`s***@getmaintainx.com`); the run results carried the full addresses.

## Calls

| # | Endpoint | Key params | Run id | Status / HTTP | Billed | What came back |
|---|---|---|---|---|---|---|
| 1 | litescrape /linkedin/jobs | q "Senior Product Designer", location "New York", page 1 | 01M83W19J44AYAS101DDMFYJGV | COMPLETED / 200 | $0.00015 | 10 postings (Cohere, Robinhood, C1, MaintainX, Uniti, Ande, Fora Travel, Oxbow Talent, Sotheby's, Gemini); description null on all |
| 2 | litescrape /linkedin/job | job_id 4468033424 | 01M83W2DYPTYAXBHS9T7FSG5PP | COMPLETED / 200 | $0.00015 | title, company, location, description, posted_relative "17 hours ago", applicants "Over 200 applicants", salary, company_url linkedin.com/company/getmaintainx; posted_at null |
| 3 | apollo /mixed_people/api_search | q_organization_domains_list[] getmaintainx.com, person_titles[] recruiter / technical recruiter / talent acquisition / talent partner, include_similar_titles true, per_page 10 | 01M83W1XCCABY0120RFPMF8JVK | COMPLETED / 200 | $0 | 6 people, all has_email true: Talent Acquisition Partner, Associate TA Partner, Senior TA Partner, TA Professional, Senior TA Specialist, Sr. Talent Partner GTM |
| 4 | apollo /mixed_people/api_search | same domain, person_titles[] head of design / design manager / director of product design / vp of design / product design lead | 01M83W1ZMF7YEXR68FA6Z5QMNY | COMPLETED / 200 | $0 | 2 people, both has_email false: Head of Design, Design Operations Manager |
| 5 | apollo /people/match | id of the Talent Acquisition Partner | 01M83W2KPQGMDT1FJK200TSBCT | COMPLETED / 200 | $0.026 | full name, LinkedIn URL, email_status verified, match_confidence high, Raleigh NC, organization primary_domain getmaintainx.com |
| 6 | apollo /people/match | id of the Head of Design | 01M83W2MGN4E9MPS5TZFFAAR5F | COMPLETED / 200 | $0.026 | full name, LinkedIn URL, employment history (Head of Design since 2026-02, before that Smartsheet), email null, email_status unavailable. Billed anyway. |
| 7 | hunterio /email-finder | first_name, last_name, domain getmaintainx.com | 01M83W4GJ0Q2YK3XZDHK2R1PXA | COMPLETED / 200 | $0.0245 | email found, score 85, source_type generated, accept_all true, verification.status valid |
| 8 | hunterio /email-verifier | that email | 01M83W7GE0Y4FCBB29PJ18H6NT | COMPLETED / 200 | $0.01225 | status valid, score 89, smtp_check true, accept_all false |
| 9 | apollo /mixed_companies/search | q_organization_name "MaintainX", per_page 3 | 01M83W7DZHQYH4Z87JSR1HNGK7 | COMPLETED / 200 | $0.026 | 3 organizations: MaintainX (primary_domain getmaintainx.com, linkedin_url matches the posting's company_url), "MaintainX Solutions LTD" (no domain), "maintain[XR]" |

Total billed: $0.115. The short path a job hunter needs (calls 2, 3, 5) is $0.02615.

## What did not go to plan

- Call 6 returned no email but was still billed $0.026. The preview in call 4 already said `has_email: false`. The skill now says to read `has_email` before matching, and to use the match only to get the full name when the user insists on that person.
- The company domain was inferred from the LinkedIn slug before call 9 confirmed it. Call 9 is the step for when the slug is not obvious; its name match also returned two unrelated companies, so the skill says to match `linkedin_url` against the posting's `company_url`.
- The finder said `accept_all: true` for the domain and the verifier said `accept_all: false` for the address. The skill reports the verifier's verdict.
- Nothing failed. Every run was COMPLETED with HTTP 200.

## Raw

`raw/<run id>.json`, one per call, as `monid runs get -r <id> -j` returned it. The two match records are trimmed to the person fields (Apollo appends the company's full technology list, about 40 KB each), photo URLs removed, addresses masked.

## Cold test (2026-11-23, a fresh agent, Cohere Senior Product Designer posting 4485477256)

Verdict PARTIAL: deliverable produced, 7 calls, $0.0889, the same path as above without the company lookup. Recruiter came back Apollo-verified; the Product Design Director had no address in Apollo, Hunter generated one and the verifier returned `accept_all` (risky, score 71). Findings folded into SKILL.md: step 5 and 6 contradicted each other on matching a `has_email: false` hiring manager (now: recruiter only when has_email true, hiring manager always, the match buys the name); no instruction for an `accept_all` verifier verdict (now: keep with the verifier's status, flag as pattern address); drafts asked for a user fact the skill never collected (now Ask first item 3); ranking rule did not demote wrong-function titles or break ties (now it does); `per_page` 10 hid 4 of 14 talent people (now 25 plus `total_entries`); domain inference wording (now allows a well-known domain, confirmed by the match). Files in `coldtest/`.
