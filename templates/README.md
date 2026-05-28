# templates/

Source of truth for boilerplate that gets **copied verbatim** into each skill
that opts in. The copy lives inside the skill folder so each
`skills/<name>/` stays self-contained when installed via `npx skills add`.

Currently shipped:

| Template | What it covers |
|---|---|
| `prerequisites.md` | Install `monid` CLI, install the upstream `monid` skill, configure an API key, agent rules |

## Opting in (two ways)

### A) Embed the template inline in `SKILL.md` (recommended)

Add a marker-delimited region anywhere in `SKILL.md`. The sync tool replaces
the content between the markers with the template body.

```markdown
## Prerequisites

<!-- TEMPLATE:prerequisites.md START -->
(this region is overwritten by `deno task sync-templates`)
<!-- TEMPLATE:prerequisites.md END -->
```

Agents reading `SKILL.md` see the prereqs inline — no need to follow a link.

### B) Sibling file in the skill folder

Create a file with the matching name:

```bash
touch skills/my-skill/prerequisites.md
```

The sync tool overwrites that file byte-for-byte with the template's contents.
Use this when you'd rather keep `SKILL.md` short and link out.

A skill can use either or both mechanisms. CI's `sync-templates:check` step
fails if any region or sibling-file copy has drifted.

## Sync commands

```bash
# Apply pending syncs (writes)
cd scripts && deno task sync-templates

# Read-only check (used in CI)
cd scripts && deno task sync-templates:check
```

## First-run bootstrap pattern (write inline per skill — NOT synced)

Bootstrap is too skill-specific to share (state-dir paths, seed files, per-skill
messaging). Follow this *order* when writing your own bootstrap section in
SKILL.md:

1. **Detect first run.** Trigger if EITHER the skill's state directory is
   absent OR the `monid` CLI is not installed/configured.
2. **Surface briefly.** Tell the user in one sentence what monid is and that
   it's pay-as-you-go. Then proceed.
3. **Run preflight** — the prerequisites section embedded above.
4. **Create state directories** under the XDG paths the skill uses.
5. **Seed user-editable files** from any shipped `*.seed.json` (treat as
   user-owned afterward; never overwrite).
