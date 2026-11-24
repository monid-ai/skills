# Verify run: salary-benchmark

Date: 2026-11-24 (UTC). Request used: "where does a $150K software engineer offer in San Francisco sit against the market? ladder Google, Meta, Amazon, Apple, Microsoft, Nvidia and OpenAI" (role Software Engineer, city San Francisco, CA, offer $150,000, seven companies, cap $1.00).

## Calls

| # | Endpoint | Key params | Run id | Status / HTTP | Billed | What came back |
|---|---|---|---|---|---|---|
| 1 | indeed /get_salary_info | job_title Software Engineer | 01M86A61ZZXF5KV4MRVZV6VXCF | COMPLETED / 200 | $0.02 | US yearly median $136,707, range $80,043 to $233,485, 38,026 data points; 51 states; 9 top cities; 9 top companies |
| 2 | indeed /get_salary_info | job_title Software Engineer, location San Francisco, CA | 01M86A39RTC7TNM8RCFKABQWB0 | COMPLETED / 200 | $0.02 | SF yearly median $185,595, range $118,681 to $290,238, 2,226 data points; national block repeated; 19 SF companies (Mercor's `main` is hourly, $92) |
| 3 | levels.fyi /get_salary_data | openai, software-engineer | 01M869GXBPTQEGM4JA8FR77NJZ | COMPLETED / 200 | $0.01 | 6 levels, no Senior title |
| 4 | levels.fyi /get_salary_data | meta, software-engineer | 01M869GY89KMSCZ04KQRD3W4ZK | COMPLETED / 200 | $0.01 | 7 levels E3 to E9 |
| 5 | levels.fyi /get_salary_data | amazon, software-engineer | 01M869GZ6D88NT55YAHASF8H3X | COMPLETED / 200 | $0.01 | 6 levels SDE I to Distinguished |
| 6 | levels.fyi /get_salary_data | apple, software-engineer | 01M869H04S0S2KFF1ATJ7ZN4YY | COMPLETED / 200 | $0.01 | 6 levels ICT2 to Distinguished |
| 7 | levels.fyi /get_salary_data | microsoft, software-engineer | 01M869H14M314KW531J06WKTW8 | COMPLETED / 200 | $0.01 | 12 levels 59 to 70 |
| 8 | levels.fyi /get_salary_data | nvidia, software-engineer | 01M869H2QV4QB6RZXA7AQE3VB6 | COMPLETED / 200 | $0.01 | 7 levels IC1 to IC7 |
| 9 | levels.fyi /get_salary_data | google, software-engineer | 01M869H3RWDTRHVGZYGFZ68HQ7 | COMPLETED / 200 | $0.01 | 7 levels L3 to L9 |
| 10 | levels.fyi /get_salary_data | google, software-engineer, location san-francisco-bay-area | 01M869FZMZKY1E7CTDXYXA3B96 | COMPLETED / 200 | $0.01 | the same US data, `location_meta: null`; location ignored, billed |

Total billed: $0.12, of which $0.11 is the recipe and $0.01 the location test.

## What did not go to plan

- The location parameter on levels.fyi did nothing (call 10). The skill treats every ladder as US-wide and tells the agent not to pay for a location variant.
- Indeed's company list carries an hourly `main` figure for Mercor; the first draft of the deliverable printed "$92 average". The skill now reads `salary.yearly`.
- Indeed's top cities for the city query put Camarillo, CA first with `numDataPoints: 0` and `inferred: true`. The skill drops rows with no data points.
- Nothing failed. Every run was COMPLETED with HTTP 200.

## Raw

`raw/<run id>.json`, one per call. Indeed records are trimmed to the fields the skill reads (the full output is about 340 KB of which most is locale strings and experiment flags); Levels.fyi records drop the company description, culture, related-company and technology blobs. Samples are the provider's redacted totals.

## Cold test (2026-11-24, a fresh agent, "is $180K a fair offer for a product manager in New York? show me how Google, Meta and Stripe pay PMs by level")

Verdict PASS: 5 calls, $0.07, exactly the skill's estimate (role plus city $0.04, three ladders $0.03). Deliverable produced by following the text. Findings folded into SKILL.md: the "Senior" rule now excludes Director/VP/Group titles (Meta's only "Senior" was Senior Director); read the YEARLY block's `numDataPoints` for cities (the HOURLY block is 0 everywhere); the company list can repeat a company under two employer keys; states need a sample floor (North Dakota on 8); Indeed is reported salary, Levels.fyi is total compensation, and the deliverable says so; samples per level run 3 to 30, rows under 10 flagged; `data.median` is one full submission and must not be copied; the location pitfall's field path corrected; `-i` is not needed. Files in `coldtest/`.
