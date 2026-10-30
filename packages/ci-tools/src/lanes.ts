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
 * without building anything. Every build lane excludes prose for the same
 * reason, `spec` excepted, since that one exists for prose.
 */
export const LANES = {
  code: { paths: ['**'], except: PROSE },
  fleet: {
    paths: [
      'apps/**',
      'clients/**',
      'packages/**',
      'modules/*/ui/**',
      'modules/*/package.json',
      'modules/*/tsconfig.json',
      'tsconfig.base.json',
      'rust-toolchain.toml',
      ...INSTALL,
    ],
    except: PROSE,
  },
  android: { paths: ['clients/tv-native/**', ...INSTALL], except: PROSE },
  desktop: {
    paths: [
      'clients/desktop/**',
      'packages/{bundler,client,core,tv,ui}/**',
      'rust-toolchain.toml',
      ...INSTALL,
    ],
    except: PROSE,
  },
  rust: {
    paths: [
      'server/**',
      'modules/**',
      'packages/cli/**',
      'packages/core/src/locales/**',
      'rust-toolchain.toml',
    ],
    except: PROSE,
  },
  sdk: {
    paths: [
      'packages/{cli,client,core,i18n,module-sdk,registry,spatial-nav,ui}/**',
      'packages/ci-tools/src/sdk/**',
      'server/crates/{kroma-module-*,kroma-domain,kroma-http,kroma-i18n,kroma-db,kroma-primitives,kroma-testing}/**',
      'server/Cargo.toml',
      ...INSTALL,
    ],
    except: PROSE,
  },
  synology: {
    paths: [
      '.github/workflows/synology.yml',
      'server/**',
      'modules/**',
      'clients/web/**',
      'clients/synology/**',
      'packages/**',
      'rust-toolchain.toml',
      ...INSTALL,
    ],
    except: PROSE,
  },
  site: {
    paths: ['apps/www/**', 'packages/{bundler,registry,site-kit,site-meta,ui}/**', ...INSTALL],
    except: PROSE,
  },
  spec: { paths: ['docs/spec/**'] },
} as const satisfies Record<string, Lane>;

export type LaneName = keyof typeof LANES;

export const LANE_NAMES = Object.keys(LANES) as LaneName[];

/**
 * A change here rewires this pipeline itself, so every lane runs. Another
 * workflow, or a script only a release workflow calls, cannot change what CI
 * checks, and reaches no lane on its own account.
 */
const PIPELINE = ['.github/workflows/ci.yml', 'packages/ci-tools/**'];

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
