import { type Dirent, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CANDIDATE = /['"]([a-zA-Z][a-zA-Z0-9]*)\/(\d+(?:\.\d+)?)['"]/g;

const SOURCE_EXT = /\.(ts|tsx)$/;

// `ios`, `android` and `src-tauri` hold no TypeScript, and `ios/Pods` alone is
// ~7,100 directories, most of the walk's cost.
const SKIP = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  '.vite',
  '.tanstack',
  'ios',
  'android',
  'src-tauri',
]);

const isTest = (name: string) => name.includes('.test.') || name.includes('.stories.');

// One walk per root set per process: every directive would otherwise re-read the repo.
const CACHE = new Map<string, Set<string>>();

function walk(dir: string, out: string[]): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const name = entry.name;
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (entry.isDirectory()) walk(full, out);
    else if (SOURCE_EXT.test(name) && !isTest(name)) out.push(full);
  }
}

/**
 * Every `token/NN` written anywhere in the source, as `token/alpha` strings.
 *
 * The suffix is always a literal, never computed, so the set is knowable
 * statically. Each combination needs its own custom property: `color-mix()`,
 * the alternative, is not parseable on the legacy webOS tier.
 */
export function scanAlphas(roots: readonly string[], known: ReadonlySet<string>): Set<string> {
  const key = `${roots.join('|')}::${[...known].sort((a, b) => a.localeCompare(b)).join(',')}`;
  const hit = CACHE.get(key);
  if (hit) return hit;

  const files: string[] = [];
  for (const root of roots) walk(root, files);

  const found = new Set<string>();
  for (const file of files) {
    let source: string;
    try {
      source = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    CANDIDATE.lastIndex = 0;
    for (const [, token, alpha] of source.matchAll(CANDIDATE)) {
      if (token && alpha && known.has(token)) found.add(`${token}/${alpha}`);
    }
  }
  CACHE.set(key, found);
  return found;
}
