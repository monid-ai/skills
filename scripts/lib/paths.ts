import { dirname, fromFileUrl, join } from "@std/path";

// import.meta.url points at scripts/lib/paths.ts — climb three levels:
//   paths.ts → lib/ → scripts/ → repo root
export const REPO_ROOT = dirname(dirname(dirname(fromFileUrl(import.meta.url))));
export const SKILLS_DIR = join(REPO_ROOT, "skills");
export const TEMPLATES_DIR = join(REPO_ROOT, "templates");
export const README_PATH = join(REPO_ROOT, "README.md");
