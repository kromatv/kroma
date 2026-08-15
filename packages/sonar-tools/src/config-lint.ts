// Guards sonar-project.properties against the one failure mode it cannot report
// itself: a pattern that matches nothing is not an error to Sonar, it simply
// stops applying. An exclusion silently lapses when its file is renamed, and the
// code it was meant to keep out of the denominator reappears there; a
// suppression silently lapses and the issue comes back as if never reviewed.
// Both have happened in this repo, which is why the properties file says so
// twice. Run: `bun run sonar:lint`.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CONFIG = process.argv[2] ?? 'sonar-project.properties';

// Patterns that are meant to match nothing today. Each guards against a tree
// the scanner walks but git does not track (build output, caches, vendored
// code), or a file type that must never be analysed if one is ever added.
// Anything NOT listed here has to match a real file or it is dead.
const DEFENSIVE = new Set([
  '**/node_modules/**',
  '**/__pycache__/**',
  '**/dist/**',
  '**/build/**',
  '**/target/**',
  '**/generated/**',
  '**/vendor/**',
  '**/*.min.js',
  'data/**',
  'clients/synology/.cache/**',
  // Binary and credential types with no instance in the tree right now. Cheap
  // insurance: the cost of a stale entry is zero, the cost of a missing one is
  // a keystore in the analysis.
  '**/*.jpeg',
  '**/*.gif',
  '**/*.woff',
  '**/*.otf',
  '**/*.keystore',
  '**/*.p12',
  // Mirrors sonar.test.inclusions, which names both spellings. No .spec file
  // exists today; one added later must not land in the denominator.
  '**/*.spec.ts',
  '**/*.spec.tsx',
  '**/*.config.js',
  // The repo has no Java of its own (only autolinked Expo module templates).
  '**/*.java',
]);

const LISTS = ['sonar.exclusions', 'sonar.coverage.exclusions', 'sonar.cpd.exclusions'] as const;

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'target', '.cache']);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') && e.name !== '.github') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(p, out);
    } else {
      out.push(p);
    }
  }
  return out;
}

/** An Ant-style Sonar glob as a regex: `**` spans directories, `*` stays in one segment. */
function toRegExp(glob: string): RegExp {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    if (glob.startsWith('**/', i)) {
      out += '(?:.*/)?';
      i += 2;
    } else if (glob.startsWith('**', i)) {
      out += '.*';
      i += 1;
    } else if (glob[i] === '*') {
      out += '[^/]*';
    } else if (glob[i] === '?') {
      out += '[^/]';
    } else {
      out += glob[i]?.replace(/[.+^${}()|[\]\\]/g, String.raw`\$&`) ?? '';
    }
  }
  return new RegExp(`^${out}$`);
}

function values(text: string, key: string): string[] {
  const body = text
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('#'))
    .join('\n')
    .replaceAll('\\\n', '');
  const escaped = key.replaceAll('.', String.raw`\.`);
  const line = new RegExp(`^${escaped}=(.*)$`, 'm').exec(body);
  return (
    line?.[1]
      ?.split(',')
      .map((v) => v.trim())
      .filter(Boolean) ?? []
  );
}

const text = readFileSync(CONFIG, 'utf8');
const files = walk('.').map((f) => f.replace(/^\.\//, ''));
const problems: string[] = [];

for (const key of LISTS) {
  const patterns = values(text, key);
  const hits = new Map<string, string[]>();

  for (const p of patterns) {
    const rx = toRegExp(p);
    let matched = files.filter((f) => rx.test(f));
    // A bare directory path also covers everything beneath it.
    if (matched.length === 0 && !p.includes('*')) {
      matched = files.filter((f) => f === p || f.startsWith(`${p.replace(/\/$/, '')}/`));
    }
    hits.set(p, matched);
    if (matched.length === 0 && !DEFENSIVE.has(p)) {
      problems.push(
        `${key}: '${p}' matches no file, so it silently does nothing. Repoint or delete it.`,
      );
    }
  }

  for (const [p, matched] of hits) {
    if (matched.length === 0) continue;
    const covered = patterns.find(
      (q) =>
        q !== p && (hits.get(q)?.length ?? 0) > 0 && matched.every((f) => hits.get(q)?.includes(f)),
    );
    if (covered) {
      problems.push(`${key}: '${p}' is redundant, fully covered by '${covered}'.`);
    }
  }
}

// A suppression whose resourceKey matches nothing stopped suppressing anything.
const ids = values(text, 'sonar.issue.ignore.multicriteria');
for (const id of ids) {
  const key = new RegExp(
    String.raw`^sonar\.issue\.ignore\.multicriteria\.${id}\.resourceKey=(.*)$`,
    'm',
  ).exec(text)?.[1];
  if (!key) {
    problems.push(`multicriteria '${id}' is declared but has no resourceKey.`);
    continue;
  }
  const rx = toRegExp(key.trim());
  if (!files.some((f) => rx.test(f))) {
    problems.push(
      `multicriteria '${id}': resourceKey '${key.trim()}' matches no file, so the rule is no longer suppressed.`,
    );
  }
}

if (problems.length > 0) {
  console.log(`${CONFIG}\n`);
  for (const p of problems) console.log(`  ${p}`);
  console.log(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log(`${CONFIG}: every exclusion and suppression still matches something.`);
