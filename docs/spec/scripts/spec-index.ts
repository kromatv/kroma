#!/usr/bin/env bun
/**
 * Build a machine-readable index of every requirement in the KROMA spec.
 *
 * An agent (or a person) resolves any requirement ID to its exact location in
 * one lookup instead of grepping prose: read `docs/spec/requirements.json`,
 * find the ID, jump to `file` + `line`. The human-facing `docs/spec/INDEX.md`
 * is generated from the same data so the two never drift.
 *
 * The spec is organised into *spaces*: each domain is a folder under docs/spec/
 * (its landing chapter is that folder's README.md, and it may hold any number of
 * further chapter files). A flat `docs/spec/foo.md` is treated as its own space.
 *
 * There is no hardcoded list of domains or prefixes. A space's prefix is whatever
 * its requirements use; the script discovers it. The only rules it enforces are
 * the ones that keep IDs unambiguous:
 *   - a space uses exactly one prefix (every chapter in the folder agrees),
 *   - a prefix belongs to exactly one space (no two spaces sharing a prefix),
 *   - every requirement ID is unique, and every line carries a valid status.
 * Adding a domain is just adding a folder and picking a prefix - no code change.
 *
 * Two modes:
 *   default   - regenerate requirements.json + INDEX.md on disk.
 *   --check    - verify only. Writes nothing; exits non-zero if the committed
 *                artefacts are stale or any requirement is invalid. Run before
 *                opening a PR.
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const SPEC_DIR = join(import.meta.dir, '..');

// Files at the root of docs/spec/ that are not spec chapters.
const ROOT_SKIP = new Set(['README.md', 'INDEX.md']);

// The space a chapter belongs to: the top folder under docs/spec/, or the file
// stem for a flat file sitting directly in docs/spec/.
function spaceOf(relPath: string): string {
  const segments = relPath.split(sep);
  return segments.length > 1 ? segments[0] : segments[0].replace(/\.md$/, '');
}

// Recursively list every .md chapter under docs/spec/, skipping the two root
// artefacts and the scripts/ folder. Paths returned are relative to SPEC_DIR.
async function chapters(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'scripts') continue;
      out.push(...(await chapters(full)));
    } else if (entry.name.endsWith('.md')) {
      const rel = relative(SPEC_DIR, full);
      if (rel.split(sep).length === 1 && ROOT_SKIP.has(entry.name)) continue;
      out.push(rel);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

const STATUSES = ['SHIPPED', 'AGREED', 'DRAFT', 'DESIGN, NOT IMPLEMENTED'] as const;
type Status = (typeof STATUSES)[number];

interface Requirement {
  id: string;
  domain: string; // the prefix, discovered from the space - not from a fixed list
  space: string; // the folder (or flat-file stem) the requirement lives in
  number: number;
  status: Status;
  text: string;
  file: string; // repo-relative path to the exact chapter
  line: number;
}

// A requirement line is an ID token first - `**LIB-4**` - then the rest. Split in
// two so a line that has the ID but a malformed remainder is *reported*, not
// silently skipped like a line that was never a requirement at all.
const REQ_ID = /^\s*(?:[-*]\s+)?\*\*([A-Z][A-Z0-9]*)-(\d+)\*\*(.*)$/;
// (STATUS) - text.  Accept em-dash, en-dash or hyphen as the separator.
const REQ_REST = /^\s*\(([^)]+)\)\s*[—–-]\s*(\S.*)$/;

async function collect(): Promise<{ reqs: Requirement[]; errors: string[] }> {
  const reqs: Requirement[] = [];
  const errors: string[] = [];
  const seenId = new Map<string, string>(); // id -> "file:line" of first sighting
  const prefixOwner = new Map<string, string>(); // prefix -> the space that owns it
  const spacePrefix = new Map<string, string>(); // space -> the one prefix it uses

  for (const rel of await chapters(SPEC_DIR)) {
    const space = spaceOf(rel);
    const lines = (await readFile(join(SPEC_DIR, rel), 'utf8')).split('\n');
    let inFence = false;
    lines.forEach((raw, i) => {
      // Never parse inside a fenced code block - spec files show example
      // requirement lines there, and those are illustrations, not requirements.
      if (/^\s*(```|~~~)/.test(raw)) {
        inFence = !inFence;
        return;
      }
      if (inFence) return;

      const idm = raw.match(REQ_ID);
      if (!idm) return;
      const [, prefix, num, rest] = idm;
      const line = i + 1;
      const where = `${rel}:${line}`;

      // One prefix per space (every chapter in the folder agrees).
      const established = spacePrefix.get(space);
      if (established === undefined) {
        spacePrefix.set(space, prefix);
      } else if (established !== prefix) {
        errors.push(
          `${where}: space "${space}" already uses prefix "${established}-", but this line uses "${prefix}-". ` +
            `One prefix per space.`,
        );
        return;
      }
      // A prefix belongs to one space.
      const owner = prefixOwner.get(prefix);
      if (owner === undefined) {
        prefixOwner.set(prefix, space);
      } else if (owner !== space) {
        errors.push(
          `${where}: prefix "${prefix}-" is already used by space "${owner}". A prefix belongs to one space.`,
        );
        return;
      }

      const restm = rest.match(REQ_REST);
      if (!restm) {
        errors.push(
          `${where}: "${prefix}-${num}" is not a well-formed requirement line ` +
            `(expected \`**${prefix}-${num}** (STATUS) - text\`)`,
        );
        return;
      }
      const [, statusRaw, textRaw] = restm;
      const status = statusRaw.trim();
      if (!STATUSES.includes(status as Status)) {
        errors.push(`${where}: "${prefix}-${num}" has invalid status "${status}"`);
        return;
      }

      // Normalise the number so LIB-04 and LIB-4 collide instead of masquerading
      // as two distinct requirements that happen to share a number.
      const number = Number(num);
      const id = `${prefix}-${number}`;
      if (seenId.has(id)) {
        errors.push(`${where}: duplicate requirement ${id} (first at ${seenId.get(id)})`);
        return;
      }
      seenId.set(id, where);
      reqs.push({
        id,
        domain: prefix,
        space,
        number,
        status: status as Status,
        text: textRaw.replace(/\s+/g, ' ').trim(),
        file: `docs/spec/${rel.split(sep).join('/')}`,
        line,
      });
    });
  }

  reqs.sort((a, b) => a.space.localeCompare(b.space) || a.number - b.number);
  return { reqs, errors };
}

function renderIndex(reqs: Requirement[]): string {
  const out: string[] = [
    '<!-- Generated by docs/spec/scripts/spec-index.ts - do not edit by hand. -->',
    '<!-- Run `bun run spec:index` after changing any requirement. -->',
    '',
    '# Requirement index',
    '',
    `${reqs.length} requirement${reqs.length === 1 ? '' : 's'} across the spec. ` +
      'The machine-readable source is [`requirements.json`](requirements.json).',
    '',
  ];
  // Group by space (reqs are already sorted by space, then number).
  const bySpace = new Map<string, Requirement[]>();
  for (const r of reqs) {
    const list = bySpace.get(r.space);
    if (list) {
      list.push(r);
    } else {
      bySpace.set(r.space, [r]);
    }
  }

  for (const [space, list] of bySpace) {
    out.push(`## ${list[0].domain} - [${space}](${space}/)`, '');
    // When a space spans several chapters, point each requirement at its file.
    const multiChapter = new Set(list.map((x) => x.file)).size > 1;
    const spaceRoot = `docs/spec/${space}/`;
    for (const r of list) {
      const chapter = r.file.replace(spaceRoot, '');
      const href = r.file.replace('docs/spec/', '');
      const suffix = multiChapter ? ` <sub>[${chapter}](${href})</sub>` : '';
      out.push(`- **${r.id}** (${r.status}) - ${r.text}${suffix}`);
    }
    out.push('');
  }
  return out.join('\n');
}

const check = process.argv.includes('--check');
const { reqs, errors } = await collect();

if (errors.length) {
  console.error(`Spec index found problems:\n${errors.map((e) => `  ✗ ${e}`).join('\n')}`);
  process.exit(1);
}

const json = `${JSON.stringify(reqs, null, 2)}\n`;
const index = renderIndex(reqs);
const jsonPath = join(SPEC_DIR, 'requirements.json');
const indexPath = join(SPEC_DIR, 'INDEX.md');

if (check) {
  const stale: string[] = [];
  for (const [path, want] of [
    [jsonPath, json],
    [indexPath, index],
  ] as const) {
    const have = await readFile(path, 'utf8').catch(() => null);
    if (have !== want) stale.push(path);
  }
  if (stale.length) {
    const listed = stale.map((p) => `  ✗ ${p}`).join('\n');
    console.error(
      `Spec index is out of date:\n${listed}\nRun \`bun run spec:index\` and commit the result.`,
    );
    process.exit(1);
  }
  console.log(`Spec index: ${reqs.length} requirement(s), up to date.`);
} else {
  await writeFile(jsonPath, json);
  await writeFile(indexPath, index);
  console.log(`Spec index: ${reqs.length} requirement(s) written to requirements.json + INDEX.md.`);
}
