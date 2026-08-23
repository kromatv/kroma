import { matchesAny } from './glob';

interface Lane {
  /** Paths that put a change in this lane. */
  paths: readonly string[];
  /** Paths that never do, even when `paths` matches them. */
  except?: readonly string[];
}

const PROSE = ['**/*.md', 'docs/**', '.claude/**', 'LICENSE'];

const INSTALL = ['bun.lock', 'package.json', 'patches/**', '.bun-version'];

/**
 * What a change can reach, as the jobs that prove it. A lane is a set of
 * path globs; a change is in every lane one of its files matches.
 *
 * `code` stands in for the `paths-ignore` a required check cannot carry: a
 * skipped job reports success, so a docs-only pull request passes the gate
 * without building anything.
 */
export const LANES = {
  code: { paths: ['**'], except: PROSE },
  fleet: {
    paths: [
      'apps/**',
      'clients/**',
      'packages/**',
      'modules/*/ui/**',
      'tsconfig.base.json',
      'rust-toolchain.toml',
      ...INSTALL,
    ],
  },
  android: { paths: ['clients/tv-native/**', ...INSTALL] },
  desktop: {
    paths: [
      'clients/desktop/**',
      'packages/{bundler,client,core,tv,ui}/**',
      'rust-toolchain.toml',
      ...INSTALL,
    ],
  },
  rust: {
    paths: [
      'server/**',
      'modules/**',
      'packages/module-tools/**',
      'packages/core/src/locales/**',
      'rust-toolchain.toml',
    ],
  },
  synology: {
    paths: [
      'server/**',
      'modules/**',
      'clients/web/**',
      'clients/synology/**',
      'packages/**',
      'rust-toolchain.toml',
      ...INSTALL,
    ],
  },
  site: {
    paths: ['apps/www/**', 'packages/{bundler,registry,site-kit,site-meta,ui}/**', ...INSTALL],
  },
} as const satisfies Record<string, Lane>;

export type LaneName = keyof typeof LANES;

export const LANE_NAMES = Object.keys(LANES) as LaneName[];

/** A change here rewires the pipeline itself, so every lane runs. */
const PIPELINE = ['.github/workflows/**', '.github/scripts/**', 'packages/ci-tools/**'];

type Verdict = Record<LaneName, boolean>;

const inLane = (file: string, lane: Lane) =>
  matchesAny(file, lane.paths) && !matchesAny(file, lane.except ?? []);

/**
 * Which lanes a set of changed files lands in. `'all'` is a change whose
 * files cannot be listed (a first push, a manual run): every lane.
 */
export function matchLanes(files: readonly string[] | 'all'): Verdict {
  const all = files === 'all' || files.some((file) => matchesAny(file, PIPELINE));
  const verdict = {} as Verdict;
  for (const name of LANE_NAMES) {
    verdict[name] = all || files.some((file) => inLane(file, LANES[name]));
  }
  return verdict;
}
