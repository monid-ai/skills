/**
 * Read-only lint pass over the skill catalog.
 *
 *   1. JSON accessory files (inputs.example.json, sample-output.json) parse.
 *   2. Frontmatter sanity (same checks as `validate`, but never writes README).
 *
 * Designed to run cleanly in CI without --allow-write. For format/lint of the
 * TypeScript sources, the `ci` task in deno.json calls `deno fmt --check` and
 * `deno lint` directly.
 *
 * Permissions: --allow-read.
 */

import { join } from "@std/path";
import { readSkills, validateSkillFrontmatter } from "../lib/skill.ts";

const ACCESSORY_JSON = ["inputs.example.json", "sample-output.json"];

function main(): number {
  const { skills, errors: readErrors } = readSkills();
  const errors: string[] = readErrors.map((e) => `${e.where}: ${e.message}`);

  for (const skill of skills) {
    errors.push(...validateSkillFrontmatter(skill));

    for (const acc of ACCESSORY_JSON) {
      const p = join(skill.dir, acc);
      let raw: string;
      try {
        raw = Deno.readTextFileSync(p);
      } catch {
        continue; // accessory is optional
      }
      try {
        JSON.parse(raw);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`skills/${skill.name}/${acc}: invalid JSON (${msg})`);
      }
    }
  }

  if (errors.length) {
    console.error("\nLint failed:");
    for (const e of errors) console.error("  - " + e);
    return 1;
  }
  console.log(`OK — ${skills.length} skill(s) linted.`);
  return 0;
}

Deno.exit(main());
