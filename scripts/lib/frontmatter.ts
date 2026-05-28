/**
 * Minimal YAML frontmatter parser for SKILL.md files.
 *
 * Supports two shapes that the repo uses:
 *   key: value
 *   key: |
 *     multi-line
 *     scalar
 *
 * We do NOT use a full YAML library because (a) we control the schema and
 * (b) it keeps the dependency surface to zero. If the schema ever grows
 * arrays or nested maps, swap this for `jsr:@std/yaml`.
 */

export interface Frontmatter {
  name?: string;
  version?: string;
  description?: string;
  provider?: string;
  [key: string]: string | undefined;
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n/;
const KV_RE = /^([a-zA-Z_][\w.-]*):\s*(.*)$/;

export function parseFrontmatter(src: string): Frontmatter | null {
  const m = src.match(FRONTMATTER_RE);
  if (!m) return null;

  const lines = m[1].split("\n");
  const out: Frontmatter = {};
  let multilineKey: string | null = null;
  let multilineBuf: string[] = [];

  for (const line of lines) {
    if (multilineKey !== null) {
      // Continue capturing the multiline block while we see indented or blank lines.
      if (/^\s+\S/.test(line) || line.trim() === "") {
        multilineBuf.push(line.replace(/^ {2}/, ""));
        continue;
      }
      out[multilineKey] = multilineBuf.join("\n").trim();
      multilineKey = null;
      multilineBuf = [];
    }

    const kv = line.match(KV_RE);
    if (!kv) continue;
    const [, k, vRaw] = kv;
    const v = vRaw.trim();
    if (v === "|" || v === ">") {
      multilineKey = k;
      multilineBuf = [];
    } else {
      out[k] = v.replace(/^["']|["']$/g, "");
    }
  }

  if (multilineKey !== null) {
    out[multilineKey] = multilineBuf.join("\n").trim();
  }

  return out;
}

export const SEMVER_RE = /^\d+\.\d+\.\d+(-[\w.]+)?$/;
