/**
 * Summary helpers for rendering the README skill index.
 * Kept separate so they're trivially unit-testable.
 */

const ABBREV_RE = /\b(?:e\.g|i\.e|vs|etc|U\.S|U\.K|Mr|Mrs|Dr|St|Inc|Co|Ltd)\.$/i;
const MIN_SUMMARY_LEN = 60;

/**
 * Return the first "real" sentence of `text`, collapsed to one line.
 * Skips common abbreviations that end in '.' (e.g., i.e., etc.) and merges
 * short opening sentences with the next one so the summary has enough context.
 */
export function firstRealSentence(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  let out = "";
  let i = 0;
  while (i < flat.length) {
    const ch = flat[i];
    out += ch;
    if (/[.!?]/.test(ch) && (i + 1 >= flat.length || /\s/.test(flat[i + 1]))) {
      if (ABBREV_RE.test(out) || out.trim().length < MIN_SUMMARY_LEN) {
        i++;
        continue;
      }
      return out.trim();
    }
    i++;
  }
  return out.trim();
}

/**
 * Extract the provider name from a SKILL.md body by scanning for the first
 * `monid run -p <provider>` or `monid inspect -p <provider>` reference.
 *
 * Returns the literal `(any)` for the umbrella `monid` skill (which demos
 * every provider) and `—` when no provider can be inferred.
 */
export function extractProvider(skillName: string, src: string): string {
  if (skillName === "monid") return "(any)";
  const m = src.match(/monid\s+(?:run|inspect)\s+-p\s+([\w.-]+)/);
  return m ? `\`${m[1]}\`` : "—";
}
