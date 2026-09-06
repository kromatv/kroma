import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { iconPass, kromaUi, sourceRoots, walkSources } from '../bundler/index.ts';
import { alphaPass } from './alpha-scan.ts';
import { kromaAtomic } from './atomic/index.ts';
import { kromaFontPreload } from './font-preload.ts';
import { kromaTokens } from './stylesheet.ts';
import { KNOWN_COLOR_NAMES } from './tokens.ts';

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
  /** Compile the static style declarations ahead of time. On by default;
   *  `KROMA_ATOMIC=0` in the environment turns it off for a build or a dev
   *  server, to tell a compiler fault from a runtime one. */
  atomic?: boolean;
  repoRoot?: string;
}

function kromaScan(repoRoot: string, icons: 'subset' | 'full') {
  return {
    name: 'kroma-scan',
    apply: 'build' as const,
    buildStart() {
      const roots = sourceRoots(repoRoot);
      const passes = [
        alphaPass(roots, KNOWN_COLOR_NAMES),
        icons === 'subset' ? iconPass(repoRoot) : null,
      ];
      walkSources(
        roots,
        passes.filter((pass) => pass !== null),
      );
    },
  };
}

/** Everything a browser build needs from the design system: the icon subset,
 *  the design tokens and the styles compiled ahead of time. Drop `kromaUI()`
 *  into `plugins` and nothing else. */
export function kromaUI({
  icons = 'subset',
  atomic = process.env.KROMA_ATOMIC !== '0',
  repoRoot,
}: KromaUIOptions = {}) {
  const root = repoRoot ?? findRepoRoot();
  return [
    kromaScan(root, icons),
    kromaUi.vite({ repoRoot: root, icons }),
    kromaTokens(),
    kromaFontPreload(),
    ...(atomic ? [kromaAtomic({ repoRoot: root })] : []),
  ];
}
