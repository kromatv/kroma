// Where this repo keeps its source, and where it keeps the React Compiler.
//
// The scanners in packages/ui/audit know neither, on purpose: they read the
// directories they are handed. This is the half that is allowed to know KROMA,
// and it is deliberately the smallest half.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { type Babel, babelAt } from '../audit/source-scan';

const ROOT = new URL('../../../', import.meta.url).pathname;

// babel-plugin-react-compiler is declared by @kroma/bundler alone, so nothing
// else in the tree can resolve it. The root is tried first anyway: a repo that
// hoists its dependencies needs no second entry, and this one stops being true
// the day the plugin moves.
const COMPILER_AT = [resolve(ROOT, 'package.json'), resolve(ROOT, 'packages/bundler/package.json')];

// Which shells put @kroma/ui through react-native-web. The phones and the two
// native TV clients compile it with React Native instead, where asking for the
// native driver is simply correct.
const RNW = new Set([
  'packages/ui/src',
  'packages/tv/src',
  'clients/web/src',
  'clients/tizen/src',
  'clients/webos/src',
  'clients/tv-web/src',
  'clients/desktop/src',
]);

/** Every workspace that ships a `src`, from the same `workspaces` globs the
 *  package manager reads, so a new client is covered the day it is added. */
function shippedTrees(root = ROOT): string[] {
  const { workspaces = [] } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
    workspaces?: string[];
  };
  const out: string[] = [];
  for (const glob of workspaces) {
    const [dir, star] = glob.split('/');
    if (!dir || star !== '*') continue;
    const parent = resolve(root, dir);
    if (!existsSync(parent)) continue;
    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const src = join(dir, entry.name, 'src');
      if (existsSync(resolve(root, src))) out.push(src);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

const compiler = (): Babel => babelAt(COMPILER_AT);

/** The same trees, each saying whether it renders through react-native-web. */
function shippedTargets(root = ROOT): Array<{ at: string; web: boolean }> {
  return shippedTrees(root).map((at) => ({ at, web: RNW.has(at) }));
}

export { compiler, ROOT, shippedTargets, shippedTrees };
