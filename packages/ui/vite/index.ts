import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { kromaUi } from '../bundler/index.ts';
import { kromaTokens } from './tokens.ts';

export { tokensCss } from './tokens.ts';

function findRepoRoot(from = process.cwd()): string {
  for (let dir = from; ; dir = dirname(dir)) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest) && readFileSync(manifest, 'utf8').includes('"workspaces"')) return dir;
    if (dirname(dir) === dir) throw new Error(`[kroma-ui] no workspace root above ${from}`);
  }
}

export interface KromaUIOptions {
  /** `full` keeps every Tabler glyph instead of the scanned subset. */
  icons?: 'subset' | 'full';
  repoRoot?: string;
}

/** Everything a browser build needs from the design system: the icon subset and
 *  the design tokens. Drop `kromaUI()` into `plugins` and nothing else. */
export function kromaUI({ icons = 'subset', repoRoot }: KromaUIOptions = {}) {
  return [kromaUi.vite({ repoRoot: repoRoot ?? findRepoRoot(), icons }), kromaTokens()];
}
