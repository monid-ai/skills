# Summary: who is hiring for the MaintainX Senior Product Designer, AI role

Request: find who is hiring for https://www.linkedin.com/jobs/view/4468033424/ and get a verified work email. Defaults taken: one recruiter plus the hiring manager, cap $1.00. Run on 2026-11-23.

## The posting, as read

- Senior Product Designer, AI at MaintainX (part of Autodesk since August 2026), New York, NY, full-time.
- Posted 17 hours before the run. Over 200 applicants already.
- $130,000 to $230,000 a year.
- Must-haves from the text: 6+ years of B2B SaaS product design, hands-on AI feature design (natural language interfaces, agents, predictive insights), systems thinking, strong written English.

## Who was found

- Talent team at getmaintainx.com: 6 people, all with an email on file. Ranked first: the Talent Acquisition Partner (plain recruiting title, recent refresh). The "Sr. Talent Partner, GTM" was ranked last because the title names a different function.
- Design leadership: a Head of Design (since February 2026, previously Director of Product Design at Smartsheet) and a Design Operations Manager. Neither had an email on file in the preview.

## Who was revealed

| Person | Title | Role | Email | Status | Cost |
|---|---|---|---|---|---|
| Sara Park | Talent Acquisition Partner | recruiter | s***@getmaintainx.com | verified (Apollo) | $0.026 |
| Joshua Chauvin | Head of Design | hiring manager | j***@getmaintainx.com | valid (Hunter verifier, score 89) | $0.06275 |

Addresses are masked in this file; the deliverable the user receives carries them in full.

## Blanks and flags

- The Head of Design had no address in Apollo. The match was still billed. Hunter generated the address from the name pattern and the verifier confirmed it, so it is reported as valid, not verified by the provider that holds the profile.
- The company domain was inferred from the LinkedIn slug and then confirmed with one company lookup ($0.026) that a careful agent could skip when the slug is this clear.

## Bill

| # | Endpoint | What it returned | Billed |
|---|---|---|---|
| 1 | litescrape /linkedin/jobs | 10 postings | $0.00015 |
| 2 | litescrape /linkedin/job | the posting, 200+ applicants | $0.00015 |
| 3 | apollo /mixed_people/api_search | 6 talent people | $0 |
| 4 | apollo /mixed_people/api_search | 2 design leads | $0 |
| 5 | apollo /people/match | recruiter, verified | $0.026 |
| 6 | apollo /people/match | hiring manager, no email | $0.026 |
| 7 | hunterio /email-finder | address, score 85 | $0.0245 |
| 8 | hunterio /email-verifier | valid, score 89 | $0.01225 |
| 9 | apollo /mixed_companies/search | domain confirmed | $0.026 |
| | Total | | $0.115 |

Files: `recruiters.csv`, `drafts.md`, this summary.
