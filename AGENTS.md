# AGENTS.md

This repo is a **catalog of installable agent skills** for the [Monid CLI](https://github.com/monid-ai/cli).

- Each skill lives in `skills/<name>/SKILL.md`.
- Accessory files (`run.sh`, `inputs.example.json`, `sample-output.json`, `README.md`) sit alongside.
- Tooling (validator, linter) lives in `scripts/` as a self-contained Deno project.

## Adding a new skill

No scaffolder yet — create a new folder under `skills/` and author the files by hand:

```bash
mkdir skills/my-new-skill
$EDITOR skills/my-new-skill/SKILL.md   # required: YAML frontmatter (name, description, version)
$EDITOR skills/my-new-skill/run.sh     # optional: end-to-end runnable script
$EDITOR skills/my-new-skill/inputs.example.json  # optional
```

Look at any existing `skills/*/SKILL.md` for the conventions.

## Shared content

Some boilerplate (currently just `prerequisites.md`) lives in `templates/` and
is **copied verbatim** into each skill that opts in. The `templates/README.md`
documents conventions (e.g. the first-run bootstrap checklist) authors should
follow inline.

To opt in for a synced file, create a file with the matching name in your
skill folder (`touch skills/my-skill/prerequisites.md`) and run
`cd scripts && deno task sync-templates`. CI's `sync-templates:check` step
fails if a synced copy drifts.

## Validating before commit

```bash
cd scripts && deno task validate
```

This regenerates the skill index in the top-level `README.md` and checks every
`SKILL.md` frontmatter.

## CI

CI runs four explicit steps on every PR (`.github/workflows/validate.yml`):

1. `deno task validate:check` — fails on stale README index or bad frontmatter.
2. `deno task sync-templates:check` — fails if any synced template copy has drifted.
3. `deno task lint` — JSON accessory files + frontmatter sanity.
4. `deno fmt --check` — TypeScript formatting.
5. `deno lint` — TypeScript lint rules.
