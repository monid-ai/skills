import { join } from "@std/path";
import { SKILLS_DIR } from "./paths.ts";
import { type Frontmatter, parseFrontmatter, SEMVER_RE } from "./frontmatter.ts";

export interface Skill {
  /** Folder name under `skills/`, also expected to equal `frontmatter.name`. */
  name: string;
  /** Absolute path to the skill folder. */
  dir: string;
  /** Absolute path to `SKILL.md`. */
  skillPath: string;
  /** Raw contents of `SKILL.md` (for downstream regex extraction). */
  source: string;
  /** Parsed frontmatter. */
  frontmatter: Frontmatter;
}

export interface SkillError {
  /** Relative path or skill name for the error message. */
  where: string;
  message: string;
}

/**
 * Walk `skills/<name>/SKILL.md`, parse each file, and return typed records.
 *
 * - Hidden folders (`.something`) and underscore-prefixed folders (`_*`) are
 *   skipped, matching how `npx skills` itself walks the tree.
 * - Folders without a `SKILL.md` produce a `SkillError` instead of silently
 *   being skipped — almost always a contributor mistake.
 * - Folders whose `SKILL.md` lacks YAML frontmatter produce a `SkillError`.
 *
 * Read-only.
 */
export function readSkills(): { skills: Skill[]; errors: SkillError[] } {
  const skills: Skill[] = [];
  const errors: SkillError[] = [];

  let entries: Deno.DirEntry[];
  try {
    entries = [...Deno.readDirSync(SKILLS_DIR)];
  } catch {
    errors.push({ where: "skills/", message: "skills/ directory not found" });
    return { skills, errors };
  }

  for (const ent of entries) {
    if (!ent.isDirectory) continue;
    if (ent.name.startsWith(".") || ent.name.startsWith("_")) continue;

    const dir = join(SKILLS_DIR, ent.name);
    const skillPath = join(dir, "SKILL.md");

    let source: string;
    try {
      source = Deno.readTextFileSync(skillPath);
    } catch {
      errors.push({
        where: `skills/${ent.name}/SKILL.md`,
        message: "missing",
      });
      continue;
    }

    const fm = parseFrontmatter(source);
    if (!fm) {
      errors.push({
        where: `skills/${ent.name}/SKILL.md`,
        message: "missing YAML frontmatter (--- ... ---)",
      });
      continue;
    }

    skills.push({ name: ent.name, dir, skillPath, source, frontmatter: fm });
  }

  return { skills, errors };
}

/**
 * Validate a single skill's frontmatter against repo conventions.
 * Returns a list of human-readable error messages (empty when clean).
 */
export function validateSkillFrontmatter(skill: Skill): string[] {
  const errs: string[] = [];
  const { name, frontmatter: fm } = skill;
  const path = `skills/${name}/SKILL.md`;

  if (!fm.name) {
    errs.push(`${path}: frontmatter missing 'name'`);
  } else if (fm.name !== name) {
    errs.push(`${path}: frontmatter name '${fm.name}' does not match folder '${name}'`);
  }
  if (!fm.description || fm.description.trim().length < 20) {
    errs.push(`${path}: 'description' must be at least 20 chars`);
  }
  if (fm.version && !SEMVER_RE.test(fm.version)) {
    errs.push(`${path}: invalid semver '${fm.version}'`);
  }
  return errs;
}
