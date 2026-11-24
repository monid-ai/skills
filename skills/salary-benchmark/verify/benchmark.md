# Salary benchmark: Software Engineer, San Francisco, CA, offer $150,000

Run on 2026-11-24 (UTC). Nine paid calls, $0.11. Sources: Indeed salary pages (employer-reported and employee-submitted, yearly), Levels.fyi company ladders (US submissions, total compensation).

## The role

- United States: median $136,707, typical range $80,043 to $233,485, 38,026 salaries.
- San Francisco, CA: median $185,595, typical range $118,681 to $290,238, 2,226 salaries.

## The offer

- $150,000 is +9.7% against the US median and −19.2% against the San Francisco median.
- It sits inside the US typical range and at the low end of the San Francisco range ($118,681 to $290,238).

## Cities and states

Top paying cities (US lookup, city median, data points):

- San Jose, CA: $189,449 (1,154), +38.6% vs US
- San Francisco, CA: $185,595 (2,226), +35.8% vs US
- New York, NY: $176,655 (1,827), +29.2% vs US
- Seattle, WA: $162,617 (2,042), +19.0% vs US
- Los Angeles, CA: $155,323 (585), +13.6% vs US
- Redmond, WA: $139,195 (327), +1.8% vs US

Highest state averages: CA $134,644, NY $123,480, DC $119,656, MD $116,844, MA $115,649.

## Top paying companies, San Francisco postings (Indeed)

Yearly figures only; Indeed reports some companies hourly, those are skipped.

- MERCOR: $310,889 average, 45 salaries
- Grammarly: $245,337 average, 28 salaries
- Whatnot: $215,469 average, 32 salaries
- Discord: $208,321 average, 28 salaries
- Rippling: $201,616 average, 36 salaries
- Meta: $197,912 average, 34 salaries

## Company ladders (Levels.fyi, US)

| Company | Entry level | Entry median | Entry p25 to p75 | Senior level | Senior median |
|---|---|---|---|---|---|
| OpenAI | L2 | $245,000 | $245,000 to $254,375 | L4 | $656,500 |
| Google | L3 | $204,500 | $188,815 to $231,114 | L5 | $428,000 |
| Meta | E3 | $201,800 | $177,000 to $209,500 | E5 | $433,000 |
| Nvidia | IC1 | $192,550 | $174,375 to $201,000 | IC3 | $300,000 |
| Amazon | SDE I | $187,550 | $170,200 to $204,250 | SDE III | $358,500 |
| Apple | ICT2 | $189,375 | $159,719 to $203,125 | ICT4 | $325,000 |
| Microsoft | SDE | $160,075 | $150,250 to $175,862 | Senior SDE | $242,000 |

The $150,000 offer is below the entry-level median at all seven companies. Full ladder in `ladders.csv`.

## Bill

| # | Endpoint | What it returned | Billed |
|---|---|---|---|
| 1 | indeed /get_salary_info Software Engineer | US median, range, states, cities, companies | $0.02 |
| 2 | indeed /get_salary_info Software Engineer, San Francisco, CA | SF median, range, SF company list | $0.02 |
| 3 | levels.fyi /get_salary_data openai software-engineer | levels, samples, percentiles | $0.01 |
| 4 | levels.fyi /get_salary_data google software-engineer | levels, samples, percentiles | $0.01 |
| 5 | levels.fyi /get_salary_data meta software-engineer | levels, samples, percentiles | $0.01 |
| 6 | levels.fyi /get_salary_data nvidia software-engineer | levels, samples, percentiles | $0.01 |
| 7 | levels.fyi /get_salary_data amazon software-engineer | levels, samples, percentiles | $0.01 |
| 8 | levels.fyi /get_salary_data apple software-engineer | levels, samples, percentiles | $0.01 |
| 9 | levels.fyi /get_salary_data microsoft software-engineer | levels, samples, percentiles | $0.01 |
| | Total | | $0.11 |
