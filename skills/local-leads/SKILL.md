---
name: local-leads
version: 0.1.0
description: Builds a list of local businesses worth contacting in one trade and one city, each with a reason to contact them and a short outreach draft. Use when the user wants a list of local businesses worth contacting in one trade and one city, with a reason to contact each. Also for "find food trucks in Austin with no website", "local lead list", "which barber shops in El Paso should I pitch", "local businesses with bad reviews and their phone numbers". A trade and a city in, leads.csv and outreach-drafts.md out, with the bill.
---

# Local leads with a reason to call

A trade and a city go in ("barber shops in El Paso, Texas"). A ranked `leads.csv` (no website, low or missing rating, recent complaints, phone where the listing has one) and one short outreach draft per lead come out. Drafts are written to a file and never sent.

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

1. Trade and city. No default. Ask for the state or country if the city name is ambiguous.
2. What the user offers. Default: "a simple one-page website with a booking link, plus help replying to Google reviews". If the request already states the offer ("I build websites"), use it as stated and do not add services the user did not mention.
3. How many leads at most. Default 25.

## Budget

As of 2026-11-22 a default run (3 search pages, 10 review pulls) costs $0.00195. The verify run cost $0.00795 with its extra checks: 18 calls, 17 at $0.00015 and one phone check at $0.0054. Default cap: $0.25. Before the first paid call, tell the user the estimate ("under one cent, cap $0.25"). Stop and ask before any call that would take the total over the cap. The per-result maps scrapers found by discover are the only thing in this job that can cost real money; do not use them without asking.

## Steps

Run `monid inspect -p litescrape -e /google/maps` and `monid inspect -p litescrape -e /google/reviews` first. Prices and schemas below are as of 2026-11-22.

1. **Is this category worth working?** One call, $0.00015.
   `monid run -p litescrape -e /google/maps --query '{"q":"<trade> in <city>, <state>","type":"search"}' -w 90 -j`
   - `type` is required. The city must be inside `q`.
   - The call returns 20 rows in `output.local_results`. Count rows with no `website`, rows with `rating` under 4.5, and rows with no `rating`.
   - If 18 or more of the 20 have their own site (not a third-party page, see step 3) and a rating of 4.5 or above, tell the user the category looks saturated, show the counts, and ask whether to continue or try another trade. Verify run: 6 of 20 had no website and 2 were under 4.5, so it continued.
   - Check that the `address` values are in the requested city before going on.

2. **Build the list.** Two more pages, $0.00015 each: the same query with `"start":20`, then `"start":40`. (`output.pagination.next.queryParams` holds the ready-made parameters.)
   - Keep per row: `title`, `address`, `phone`, `rating`, `reviews`, `website`, `type`, `place_id`, `data_id`, `business_status`.
   - Dedupe by `place_id`. Pages overlap: the verify run fetched 60 rows and 55 were unique.
   - Drop rows whose `business_status` says the business is closed (temporarily or permanently) and rows in a different metro area. A row with no `business_status` is unknown, not closed: keep it and say so in `notes`. Rows in an adjacent suburb, and service-area listings that give only a suburb (mobile businesses often do), are not in the city as the user wrote it: keep them out of the main list, show them as a separate short list, and ask the user whether to include them. Do not widen the location on your own.
   - Stop paging when a page adds fewer than 10 new rows.
   - Go on to `start` 60 and 80 only if the user asked for more than 25 leads.

3. **Classify the website.** No call. Set `website_kind`:
   - `none`: no `website` field.
   - `third_party_page`: the link is a booking platform, social profile, link-in-bio page or free site-builder subdomain. Verify run: 25 of 55 (most were booking pages).
   - `broken_link`: the URL is visibly malformed (for example a doubled domain). For a website offer this is a lead; say so in `notes`.
   - `own_site`: anything else.

4. **Pick the leads.** No call. An explicit filter in the request comes before everything below: "with no website" means only `website_kind` `none` (list `third_party_page` rows separately and let the user decide), "with bad reviews" means only rating and complaint reasons. Never fill unused slots with rows that fail the user's filter. Apply the filter again after step 5: a lead whose reviews show it does have a website leaves a "no website" list (show it separately), and for "bad reviews" an unrated listing does not qualify, since there is no review evidence. Then match the reasons to the offer:
   - Offer is a website or booking: `none` and `third_party_page` are the reasons that matter. A shop that already has its `own_site` is a weak lead even with a low rating: keep it at the bottom only while the list is under the user's maximum, otherwise drop it, and say in `notes` that it is a weak lead for this offer.
   - Offer is review or reputation help: rating and complaints are the reasons that matter, whatever the website.
   - Offer covers both: all reasons count.
   A row with a reason that matches the offer is a strong lead; a row with only non-matching reasons is a weak lead. The reasons are:
   - `website_kind` is `none` (or `third_party_page`, when the offer is a website).
   - `rating` is under 4.5.
   - `rating` is missing. Test for missing explicitly; a plain "less than 4.5" comparison drops unrated rows.
   Then screen:
   - Group rows that are the same business by name, phone and website. For a local business with 2 or more locations keep one row and list the other locations in `notes`.
   - Drop chains unless the user sells to franchisees: national or regional chains, franchise locations and membership brands. A `website` that is a store-locator page on a corporate domain is the usual sign.
   - Do not group by a shared first word alone. Verify run: two unrelated shops both started with "Fort Bliss".

5. **Read the complaints.** If the offer is website-only, pull reviews only for strong leads, and cite a complaint in a draft only when it relates to the offer (cannot find information, prices not shown, booking, no reply). One call per lead with `rating` under 4.5, $0.00015 each, at most 10 calls (lowest rating first).
   `monid run -p litescrape -e /google/reviews --query '{"data_id":"<data_id>","sort_by":"ratingLow","num":20}' -w 90 -j`
   - Keep from `output.reviews`: `rating`, `iso_date`, `snippet`. Do not copy the `user` object anywhere.
   - Only use reviews with `rating` 1 or 2, a non-empty `snippet`, and an `iso_date` inside the last 24 months. Verify run: 8 of 10 businesses had at least one; the other 2 had only older complaints.
   - If the only qualifying review has no specific, fixable detail ("Over priced !"), do not count `recent_complaints`; note it instead.
   - If a review mentions the business's website and the listing has none, add a note: the site exists but is not linked on Google, which changes the pitch.
   - Write a one-sentence paraphrase of the most specific, fixable complaints (waits, prices not shown, appointment not honoured, request not followed) and the months they were posted. If nothing qualifies, leave `complaint_summary` empty and add a note.
   - `output.topics` (keyword plus mention count) is a quick cross-check of themes.

6. **Phones.** No call by default. `phone` comes from the search rows. Verify run: 53 of 55 rows and 23 of 24 leads had one.
   - If a lead has no phone, leave it blank and say so in `notes`. In the verify run the place lookup on the same endpoint (`{"place_id":"<place_id>","type":"place"}`, $0.00015) and `dataforseo /google-business/info` ($0.0054) both returned no phone for the same listing, so a missing phone meant the Google profile had none.

7. **Rank.** Put leads with a reason that matches the offer (step 4) ahead of leads without one. Within the matching group count only the reasons that match the offer, then sort by `reviews` descending; on a tie `none` goes ahead of `third_party_page` and `broken_link`, then the lower rating first. Move a lead whose notes say a site exists but is not linked below the other `none` leads. Within the weak group sort by number of reasons, then `reviews`. Cut to the user's maximum. If fewer leads than the maximum remain, say so; do not pad the list.

8. **Write the drafts.** No call. One draft per lead in `outreach-drafts.md`, 50 to 90 words each:
   - Open with one fact from the listing (rating and review count, no website, where the website button leads, no phone).
   - If there is a `complaint_summary`, cite one complaint with its month, paraphrased.
   - Connect it to the user's offer in one sentence and end with one small ask.
   - Leave `[Your name]` and `[Your business]` as placeholders.
   - Never name a reviewer or a staff member. Skip complaints about sensitive personal matters and fall back to the rating.
   - Do not send anything. Tell the user the drafts are in the file for them to read and edit.

## If a step fails

- Maps search fails or returns no `local_results`: `litescrape /google/local` ($0.00015 per call) with `--query '{"q":"<trade> in <city>, <state>","location":"<city>, <state>"}'`. Verified: 20 rows with `title`, `address`, `rating`, `reviews`; website and phone sit under `links.website` and `links.phone` (as `tel:+1 ...`). Copy those two into `website` and `phone` before step 3, or every fallback row is classed as having no website and no phone. Its `place_id` is a numeric CID and rows have no `data_id`, so the review call in step 5 cannot be made from these rows: skip step 5 for them, write "complaints not checked" in `notes`, and never present that as "no complaints". If that also fails, `monid discover -q "google maps business search"`, then inspect.
- Reviews fail: `monid discover -q "google maps reviews for one place"`, then inspect.
- User insists on phones for leads that have none: `monid discover -q "local business phone number lookup"`, inspect, and state the price first. Never guess parameters.
- On `RATE_LIMITED`, wait the stated seconds. Check `monid runs list -l 50` before re-running a paid call.
- A run can show status `COMPLETED` while the provider call failed. Check `providerResponse.httpStatus` in the run result before using the output.

## Pitfalls

- A query with no city returns 20 well-formed rows from New York with status 200, billed. `search_metadata.google_maps_url` shows the New York viewport even when results are correct, so check `address` instead.
- Omitting `type` is rejected before the run starts: "type is required when searching by q".
- The inspect summary for `/google/maps` does not list `website` among the row fields. It is returned when the listing has one.
- Page 2 repeated 5 rows from page 1. Dedupe before counting.
- `sort_by` accepts `qualityScore`, `newestFirst`, `ratingHigh`, `ratingLow` only. `ratingLow` has no date filter: the 20 lowest reviews reached back to 2016.
- Review text often names staff. Paraphrase, do not quote names.
- A `website` can be a booking page, a social profile or a third-party directory page. That is a softer lead signal than no website; record it but do not count it as `no_website`.
- The per-star breakdown in a place lookup is called `rating_summary`.
- `monid run -j` shows `price` and `billing.reportedCost` (micro-dollars). Confirm the billed amount with `monid runs get -r <runId> -j` (`cost.value`, USD).
- Check the billed cost on each run. A 200 with unusable results can still be billed.

## Deliverable

- `leads.csv` with columns: `rank, business, address, phone, rating, review_count, website, website_kind, reasons, complaint_summary, complaint_dates, notes, place_id`.
- `outreach-drafts.md`: a header (offer used, data date, "drafts only, nothing sent"), then one section per lead in rank order with phone, rating, reason line and the draft.
- Chat reply: the category check counts, how many unique businesses and how many leads, the top 5 leads with their reason, where the two files are, the bill, and a reminder that nothing was sent.

## Report the bill

Fill this from `monid runs get` for every call, including failed or unused ones.

| # | Endpoint | What it returned | Billed |
|---|----------|------------------|--------|
| 1 | litescrape /google/maps (search, start 0) | 20 rows, category check | $ |
| 2 to 3 | litescrape /google/maps (start 20, 40) | 40 rows, N new | $ |
| 4 to N | litescrape /google/reviews (ratingLow) | 20 reviews each | $ |
| | any other call | | $ |
| | **Total** | | **$** |
