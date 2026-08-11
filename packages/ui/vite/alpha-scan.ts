import { basename } from 'node:path';
import { type SourcePass, walkReaches, walkSources } from '../bundler/index.ts';

const CANDIDATE = /['"]([a-zA-Z][a-zA-Z0-9]*)\/(\d+(?:\.\d+)?)['"]/g;

const isTest = (name: string) => name.includes('.test.') || name.includes('.stories.');

interface Scan {
  found: Set<string>;
  walked: boolean;
}

// One walk per root set per process: every directive would otherwise re-read the repo.
const CACHE = new Map<string, Scan>();

const key = (roots: readonly string[], known: ReadonlySet<string>) =>
  `${roots.join('|')}::${[...known].sort((a, b) => a.localeCompare(b)).join(',')}`;

function scan(roots: readonly string[], known: ReadonlySet<string>): Scan {
  const k = key(roots, known);
  const hit = CACHE.get(k);
  if (hit) return hit;
  const fresh: Scan = { found: new Set(), walked: false };
  CACHE.set(k, fresh);
  return fresh;
}

function collect(source: string, known: ReadonlySet<string>, into: Set<string>): boolean {
  let grew = false;
  for (const [, token, alpha] of source.matchAll(CANDIDATE)) {
    if (!token || !alpha || !known.has(token)) continue;
    const combo = `${token}/${alpha}`;
    if (into.has(combo)) continue;
    into.add(combo);
    grew = true;
  }
  return grew;
}

/** The alpha scan as one pass, for a caller already walking the workspace for
 * something else. Null once the answer is known. */
export function alphaPass(roots: readonly string[], known: ReadonlySet<string>): SourcePass | null {
  const state = scan(roots, known);
  if (state.walked) return null;
  return {
    wants: (name) => !isTest(name),
    read(source) {
      collect(source, known, state.found);
    },
    done() {
      state.walked = true;
    },
  };
}

/**
 * Every `token/NN` written anywhere in the source, as `token/alpha` strings.
 *
 * The suffix is always a literal, never computed, so the set is knowable
 * statically. Each combination needs its own custom property: `color-mix()`,
 * the alternative, is not parseable on the legacy webOS tier.
 */
export function scanAlphas(roots: readonly string[], known: ReadonlySet<string>): Set<string> {
  const state = scan(roots, known);
  const pass = alphaPass(roots, known);
  if (pass) walkSources(roots, [pass]);
  return state.found;
}

/**
 * Folds a file the dev server saw change into the scan already made, and
 * answers whether it named a step no stylesheet carries yet.
 *
 * Only files the walk itself reads count, so a step spelled in a test cannot
 * reach a dev page the build would not give it.
 */
export async function foldAlphas(
  roots: readonly string[],
  known: ReadonlySet<string>,
  file: string,
  read: () => string | Promise<string>,
): Promise<boolean> {
  const state = CACHE.get(key(roots, known));
  if (!state?.walked) return false;
  if (!walkReaches(roots, file) || isTest(basename(file))) return false;
  return collect(await read(), known, state.found);
}
