---
name: ai-visibility
version: 0.1.0
description: Checks whether AI answer engines (ChatGPT, Perplexity, Gemini, Google AI Mode and AI Overviews) mention your brand, and which sources they cite. Use when the user wants to know whether AI answer engines mention their brand. Also for "does ChatGPT recommend us", "AI visibility check", "which sources do AI answers cite in my category", "GEO audit". Brand, domain, up to three competitors and buyer questions in, visibility.csv and report.md out, with the bill.
---

# AI visibility check

A brand, its domain, up to three competitors and a few buyer questions go in. Out comes a table of what ChatGPT, Perplexity, Gemini, Google AI Mode and Google AI Overview answered: whether the brand is named, in what position, whether its domain is cited, which competitors are named, and which source URLs the engines cite most.

This is a sample. Each engine is asked each question once, and answers vary between runs, countries and sessions. Say so in the report and never present the result as a share-of-voice number.

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

1. Brand and domain. No default, this is required (for example "Shortcut, shortcut.com").
2. Competitors, up to three, with their domains if known. Default: propose three and show them.
3. Questions buyers ask. Default: draft five and show them before spending. Country defaults to US. If the user names another country, turn it into its two-letter code and send it to every engine that takes one (`country` for ChatGPT and Gemini, `gl` for both Google endpoints) and say in the report which country was used. Only US was run in the verified runs.

Draft questions the way a buyer types them: category questions ("best X for Y"), an alternative-to question, a use-case question. Do not put the brand name in a question. If a question names a competitor, that competitor will appear in every answer to it, so say that in the report.

## Budget

As of 2026-11-22 one question across all five engines was billed $0.0080. Three questions cost $0.0240 for the 15 answers ($0.0299 with one fallback test and two unbilled failures). A default run of five questions is about $0.04. Default cap: $0.25. State the estimated cost before the first paid call. Stop and ask before going over the cap.

## Steps

1. **Fix the names.** For the brand and each competitor write down: the exact name as the company writes it, the domain, and whether the name is an ordinary word (Linear, Shortcut, Notion) or a word that is always capitalised in normal writing (Monday, Apollo, Amazon). A multi-word name made of ordinary words (Screen Studio) is treated as an ordinary word: match the exact capitalised phrase. Add exclude phrases for known other meanings ("Linear regression", "Shortcut key"). Show the questions and the cost estimate, then wait for "go" if you drafted the questions.

2. **Inspect, then ask each engine each question.** Run `monid inspect` on each endpoint once per session. Send the five calls for a question in parallel, with `-w 180 -j`, and save every run record. Most answers took 7 to 48 seconds on 2026-11-22; one ChatGPT answer took 132 seconds. Keep `-w 180` and give the shell at least 200 seconds.

   | Engine | Endpoint | Input | Billed per answer | Keep |
   |---|---|---|---|---|
   | ChatGPT | cloro `/chatgpt/ask` | body `prompt`, `country` (two-letter code of the requested country, default "US") | $0.0028 | `output.result.text`, `result.sources[].url` |
   | Perplexity | anyapi `/perplexity.search` | body `prompt` (default route) | $0.0025 | `output.data.answerMarkdown`, `data.citations[].url` |
   | Gemini | cloro `/gemini/ask` | body `prompt`, `country` | $0.0024 | `output.result.text`, `result.sources[].url` |
   | Google AI Mode | litescrape `/google/ai-mode` | query `q`, `gl` (the same two-letter code in lower case, "ca" for Canada, default "us"), `hl` ("en") | $0.00015 | `output.text_blocks`, `output.references[].link` |
   | Google AI Overview | litescrape `/google/ai-overview` | query `q`, `gl`, `hl` | $0.00015 | `output.ai_overview.text_blocks`, `ai_overview.references[].link` |

   The litescrape endpoints are GET: pass the parameters with `--query '<json>'`. A text block holds text in `snippet`, in `list[]` items (`title`, `snippet`, nested `list`) and in `table[].cells`. Flatten all three.

3. **Check each run before using it.** A run can have status `COMPLETED` and still be a failure: read `providerResponse.httpStatus`. Anything other than 200 is no answer. Read the billed cost from `cost.value` (cloro, anyapi) or `billing.reportedCost.value`, which is in micro dollars (litescrape). Record both for the bill.

4. **Detect mentions with this rule**, for the brand and each competitor, on the answer text only (not on source titles). Clean the text first: for Perplexity, delete the footnote definition lines (`[n]: <url> "<title>"`), which are sources; for Google AI Mode and AI Overview, drop the trailing source cards (see Pitfalls). Then:
   - Strip markdown emphasis first. Match the name as a whole token: not preceded by a letter, digit, `-`, `.`, `/`, `@` or `#`, and not followed by a letter, digit or `_`. This rejects "LinearB", "nonlinear" and "Non-Linear". A possessive or a hyphen after the name is fine.
   - If the name is not an ordinary word (Jira, ClickUp), match case-insensitively. Any hit is a mention.
   - If the name is an ordinary word, match the exact capitalisation only. Lowercase uses ("keyboard shortcuts", "a linear workflow") are not mentions. Drop hits that begin an exclude phrase.
   - A capitalised hit that starts a sentence is ambiguous ("Linear workflows reduce overhead"). A sentence start is: the start of the text, a line, a list item, a table cell or a heading, or the first word after `.`, `!` or `?`. Count it only if the name is followed by end of line, `:`, `(`, `,`, `|`, `/`, `&`, a dash, `'s`, or "is / vs / and / or / offers / has". Otherwise mark it `check`.
   - If the name is always capitalised in normal writing (Monday), every bare hit is `check`.
   - The brand's domain written in the answer text (shortcut.com) is a mention.
   - Resolve each `check` by reading the 70 characters either side and deciding yes or no. List every resolved `check` in the report with the snippet. If any other hit in the same answer is a clear mention, the answer is a yes.

5. **Fill the row.** `brand_mentioned`: yes or no. `position`: order of first mention among the brand and the tracked competitors only (1 = named first); blank if not mentioned. `competitors_mentioned`: tracked competitors in order of first mention. `cited_urls`: the engine's source URLs with `#fragment` and `utm_` parameters removed, deduped, order kept. `domain_cited`: yes if any cited URL's host is the brand domain or a subdomain of it. Mention and citation are separate facts. Keep them in separate columns and never merge them into one score.

6. **Rank the sources.** For each cited URL and each cited domain count how many answers cite it. Label each top domain: the brand, a tracked competitor, another vendor, a review site, or third party (roundups, forums, media). Label from the URL and the reference title or snippet only, and mark a label "unverified" when those do not settle it; do not fetch the pages. Drop image and logo pages and google.com redirect links, and say how many references were unresolved redirects.

7. **Find the gaps.** A gap is an answer where the brand is not mentioned and at least one tracked competitor is. Rank questions by the number of engines with a gap and take up to three. For each, list the third-party and review-site URLs cited in the gap answers. Those are the pages to get mentioned on. If fewer than three questions have a gap, list what there is and say so. If there are no gaps at all (a dominant brand), say so, then report the two things that still matter: answers where the brand is missing even though no competitor is named, and the engines that name the brand but never cite its domain.

## If a step fails

- Perplexity: the verified fallback is dataforseo `/ai/perplexity-response` with body `user_prompt`, `model_name` "sonar", `web_search_country_iso_code`; text in `output[0].items[].sections[].text`, sources in `sections[].annotations[].url`. Billed $0.0059 on 2026-11-22 (a per-call fee plus token cost). It is the API model, not the consumer app, so label the row "Perplexity (sonar API)".
- Google AI Mode 503: retry once. It answered on the second try in the verify run.
- Any other engine: `monid discover -q "ChatGPT answer with cited sources"` (or "Gemini answer with sources", "Google AI Mode answer"), then `monid inspect`. Never guess parameters. Prefer an endpoint that returns sources, since half of this report is the source list.
- If an engine cannot be reached, write its rows with `brand_mentioned` = `no_answer` and say which engine is missing. Do not fill the cell from memory.

## Pitfalls

- cloro `/perplexity/ask` returned HTTP 400 MODEL_UNAVAILABLE ("Perplexity now blocks logged-out sessions") on 2026-11-22. Do not use it.
- Failures arrive as status `COMPLETED` with the real code in `providerResponse.httpStatus` (seen: 400 and 503). Both were billed $0, but check the billed cost on each run.
- A domain can be cited without the brand being named. In the verify run Perplexity cited a brand blog post and did not mention the brand.
- The Perplexity route has no country parameter. The other four engines are pinned to a country, so say that in the report.
- Perplexity returned a one-sentence answer with one inline citation and a list of 10 citations. Record all 10, and note that listed is not the same as quoted.
- Gemini cited 1 to 4 sources per answer and Google AI Mode 1 to 11. A short source list is normal, not an error.
- Google AI Mode and AI Overview both end with a list block that repeats source cards (site name, page title, snippet), and AI Mode can start with a "Shared" heading. The source cards are the trailing block: the last unbroken run of list items at the end of the answer. Apply this rule only inside that block, never to list items earlier in the answer, because a real recommendation can start with a name that is also a reference source. Inside the block, skip an item when its text contains any `references[].title`, or starts with any `references[].source` name or reference host, or source titles get counted as mentions. The cards arrive as one `snippet` with source name, page title and excerpt run together; AI Mode cards carry no `link`, and AI Overview card links are `google.com/goto` redirects, so a check against the item's own link does not work.
- AI Overview references can be `google.com/goto?url=...` redirects (6 of 35 in one run). The real target is unknown, so a brand-domain citation can hide behind one.
- ChatGPT's sources include image and logo pages (icons8.com, iconlogovector.com were seen). Exclude them from the source ranking.
- The inspect output for `/google/ai-overview` says it answers a 404 that is not charged when Google shows no overview. Not seen in the verify run. Treat it as `no_answer`.
- The litescrape `/google/gemini` endpoint is cheaper, but its inspect output lists text only, no sources. Not used here for that reason.

## Deliverable

- `visibility.csv`, one row per question and engine: `question, engine, brand_mentioned, position, domain_cited, competitors_mentioned, cited_urls`. Competitors are joined with `; ` and URLs with ` | `.
- `report.md`: the sample warning at the top; counts (answers that name the brand, answers that cite the domain, out of how many); the per-question and per-engine table; how names were matched and every resolved `check`; the most cited domains and URLs with their labels; up to three gap questions with the sources cited in them; which sources to go after first; caveats seen in this run.
- Chat reply: the sample warning in one sentence, the two counts, the gap questions, the top five sources to go after, the file paths, and the bill.

Do not contact any site owner or author. If the user wants outreach, that is a separate job and it produces drafts only.

## Report the bill

One row per call, failures included, then the total.

| Endpoint | Question | What it returned | Billed |
|---|---|---|---|
| cloro /chatgpt/ask | Q1 | answer, 14 sources | $0.0028 |
| litescrape /google/ai-mode | Q1 | HTTP 503, no answer | $0.0000 |
| ... | | | |
| **Total** | | 15 answers, 18 calls | **$0.0299** |
