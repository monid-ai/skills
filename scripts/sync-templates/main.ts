/**
 * Sync shared template files from templates/ into every skill that opts in.
 *
 * Two opt-in mechanisms:
 *
 *   A) Sibling-file copy.
 *      A skill creates a file of the matching name in its folder
 *      (e.g. `touch skills/my-skill/prerequisites.md`). The sync overwrites
 *      it with the template's exact contents.
 *
 *   B) Marker-region injection inside SKILL.md.
 *      A skill's SKILL.md contains paired markers:
 *        <!-- TEMPLATE:prerequisites.md START -->
 *        ... (this region is overwritten by sync) ...
 *        <!-- TEMPLATE:prerequisites.md END -->
 *      The sync replaces everything between the markers with the template
 *      body. Useful when a skill wants the content inline so the agent can
 *      read it without following a sibling-file link.
 *
 * Both mechanisms can coexist; sync handles whichever the skill opts into.
 * Drift in either is caught by `--check` mode.
 *
 * `templates/README.md` is treated as documentation, not a synced template,
 * and is ignored.
 *
 * Permissions: --allow-read (and --allow-write unless --check).
 */

import { basename, join } from "@std/path";
import { SKILLS_DIR, TEMPLATES_DIR } from "../lib/paths.ts";

const CHECK_ONLY = Deno.args.includes("--check");
const IGNORED_TEMPLATES = new Set(["README.md"]);

interface DriftRecord {
  template: string;
  skill: string;
  path: string;
  kind: "sibling" | "marker";
}

function listTemplates(): string[] {
  const out: string[] = [];
  for (const ent of Deno.readDirSync(TEMPLATES_DIR)) {
    if (!ent.isFile) continue;
    if (IGNORED_TEMPLATES.has(ent.name)) continue;
    out.push(ent.name);
  }
  return out;
}

function listSkillDirs(): string[] {
  const out: string[] = [];
  for (const ent of Deno.readDirSync(SKILLS_DIR)) {
    if (!ent.isDirectory) continue;
    if (ent.name.startsWith(".") || ent.name.startsWith("_")) continue;
    out.push(ent.name);
  }
  return out;
}

function markerRegex(templateName: string): RegExp {
  // Match the START marker, capture the body, then the END marker.
  // Tolerates extra surrounding whitespace on the marker lines.
  const start = `<!--\\s*TEMPLATE:${escapeRegex(templateName)}\\s*START\\s*-->`;
  const end = `<!--\\s*TEMPLATE:${escapeRegex(templateName)}\\s*END\\s*-->`;
  return new RegExp(`${start}[\\s\\S]*?${end}`);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function syncMarkerRegion(
  skillName: string,
  templateName: string,
  templateBody: string,
  drift: DriftRecord[],
): boolean {
  const skillPath = join(SKILLS_DIR, skillName, "SKILL.md");
  let src: string;
  try {
    src = Deno.readTextFileSync(skillPath);
  } catch {
    return false;
  }
  const re = markerRegex(templateName);
  if (!re.test(src)) return false; // skill did not opt in via markers

  const replacement =
    `<!-- TEMPLATE:${templateName} START -->\n${templateBody}\n<!-- TEMPLATE:${templateName} END -->`;
  const updated = src.replace(re, replacement);
  if (updated === src) return false; // already in sync

  if (CHECK_ONLY) {
    drift.push({
      template: templateName,
      skill: skillName,
      path: `skills/${skillName}/SKILL.md (${templateName} region)`,
      kind: "marker",
    });
  } else {
    Deno.writeTextFileSync(skillPath, updated);
    console.log(`Synced templates/${templateName} → skills/${skillName}/SKILL.md (region)`);
  }
  return true;
}

function syncSiblingFile(
  skillName: string,
  templateName: string,
  templateBody: string,
  drift: DriftRecord[],
): boolean {
  const target = join(SKILLS_DIR, skillName, basename(templateName));
  let current: string;
  try {
    current = Deno.readTextFileSync(target);
  } catch {
    return false; // skill did not opt in via sibling file
  }
  if (current === templateBody) return false; // in sync

  if (CHECK_ONLY) {
    drift.push({
      template: templateName,
      skill: skillName,
      path: `skills/${skillName}/${templateName}`,
      kind: "sibling",
    });
  } else {
    Deno.writeTextFileSync(target, templateBody);
    console.log(`Synced templates/${templateName} → skills/${skillName}/${templateName}`);
  }
  return true;
}

function main(): number {
  const templates = listTemplates();
  const skills = listSkillDirs();
  const drift: DriftRecord[] = [];
  let acted = 0;

  for (const tpl of templates) {
    const tplPath = join(TEMPLATES_DIR, tpl);
    const tplBody = Deno.readTextFileSync(tplPath);

    for (const skill of skills) {
      if (syncSiblingFile(skill, tpl, tplBody, drift)) acted++;
      if (syncMarkerRegion(skill, tpl, tplBody, drift)) acted++;
    }
  }

  if (CHECK_ONLY) {
    if (drift.length) {
      console.error("\nTemplate sync drift detected:");
      for (const d of drift) {
        console.error(`  - ${d.path} differs from templates/${d.template}`);
      }
      console.error("\nRun: cd scripts && deno task sync-templates");
      return 1;
    }
    console.log(
      `OK — all synced templates are up to date (${templates.length} template(s), ${skills.length} skill(s) checked).`,
    );
    return 0;
  }

  if (acted === 0) {
    console.log(
      `OK — nothing to sync (${templates.length} template(s), ${skills.length} skill(s) checked).`,
    );
  } else {
    console.log(`\nSynced ${acted} location(s).`);
  }
  return 0;
}

Deno.exit(main());
