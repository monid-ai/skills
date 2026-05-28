/**
 * Validate every skills/<name>/SKILL.md and regenerate the README skill index.
 *
 * Checks:
 *   - SKILL.md exists in each skills/<name>/
 *   - YAML frontmatter parses
 *   - frontmatter.name matches folder name
 *   - frontmatter.description is at least 20 chars
 *   - frontmatter.version (if present) is valid semver
 *
 * Default mode regenerates the README skill index in place.
 * `--check` mode (CI) is read-only and fails if the index would change.
 *
 * Permissions: --allow-read (and --allow-write unless --check).
 */

import { README_PATH } from "../lib/paths.ts";
import { readSkills, validateSkillFrontmatter } from "../lib/skill.ts";
import { extractProvider, firstRealSentence } from "../lib/summary.ts";

const CHECK_ONLY = Deno.args.includes("--check");

interface IndexRow {
  name: string;
  summary: string;
  provider: string;
}

function renderIndex(rows: IndexRow[]): string {
  const lines = [
    "| Skill | What it does | Provider |",
    "|---|---|---|",
    ...rows.map(
      (r) => `| [\`${r.name}\`](skills/${r.name}/) | ${r.summary} | ${r.provider} |`,
    ),
  ];
  return `<!-- SKILL_INDEX_START -->\n\n${lines.join("\n")}\n\n<!-- SKILL_INDEX_END -->`;
}

function main(): number {
  const { skills, errors: readErrors } = readSkills();
  const errors: string[] = readErrors.map((e) => `${e.where}: ${e.message}`);

  const rows: IndexRow[] = [];
  for (const skill of skills) {
    errors.push(...validateSkillFrontmatter(skill));
    rows.push({
      name: skill.name,
      summary: firstRealSentence(skill.frontmatter.description ?? ""),
      provider: skill.frontmatter.provider ?? extractProvider(skill.name, skill.source),
    });
  }

  // Sort: umbrella `monid` first, then alphabetical.
  rows.sort((a, b) => {
    if (a.name === "monid") return -1;
    if (b.name === "monid") return 1;
    return a.name.localeCompare(b.name);
  });

  // Regenerate README index.
  let readme: string;
  try {
    readme = Deno.readTextFileSync(README_PATH);
  } catch {
    errors.push("README.md: not found");
    return finish(errors, rows.length);
  }

  const blockRe = /<!-- SKILL_INDEX_START -->[\s\S]*?<!-- SKILL_INDEX_END -->/;
  if (!blockRe.test(readme)) {
    errors.push("README.md: missing <!-- SKILL_INDEX_START --> / END markers");
    return finish(errors, rows.length);
  }

  const newBlock = renderIndex(rows);
  const updated = readme.replace(blockRe, newBlock);

  if (updated !== readme) {
    if (CHECK_ONLY) {
      errors.push("README.md: skill index is out of date. Run: deno task validate");
    } else {
      Deno.writeTextFileSync(README_PATH, updated);
      console.log("Regenerated README skill index.");
    }
  }

  return finish(errors, rows.length);
}

function finish(errors: string[], count: number): number {
  if (errors.length) {
    console.error("\nValidation failed:");
    for (const e of errors) console.error("  - " + e);
    return 1;
  }
  console.log(`OK — ${count} skill(s) validated.`);
  return 0;
}

Deno.exit(main());
