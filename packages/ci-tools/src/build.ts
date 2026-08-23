import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { $ } from 'bun';
import { setOutput } from './actions';
import { root } from './root';

interface Target {
  script: string;
  /** What the build leaves behind, relative to the repository root; null for a check that leaves nothing. */
  dist: string | null;
}

/** Every client a push proves in production mode, by the root script that builds it. */
const TARGETS = {
  web: { script: 'build:web', dist: 'clients/web/dist' },
  site: { script: 'build:site', dist: 'apps/www/dist/client' },
  tizen: { script: 'build:tizen', dist: 'clients/tizen/dist' },
  webos: { script: 'build:webos', dist: 'clients/webos/dist' },
  'tv-web': { script: 'build:tv-web', dist: 'clients/tv-web/dist' },
  kit: { script: 'build:kit', dist: 'apps/kit/dist' },
  desktop: { script: 'build:desktop', dist: 'clients/desktop/dist' },
  'tv-native': { script: 'build:tv-native', dist: null },
  mobile: { script: 'build:mobile', dist: null },
} as const satisfies Record<string, Target>;

type TargetName = keyof typeof TARGETS;

const TARGET_NAMES = Object.keys(TARGETS) as TargetName[];

const isTarget = (value: string | undefined): value is TargetName =>
  value !== undefined && value in TARGETS;

const TIZEN_TIERS = ['modern', 'legacy', 'deep'] as const;

async function sliceTizen(): Promise<void> {
  const tizen = join(root, 'clients/tizen');
  for (const tier of TIZEN_TIERS) await $`bun run slice ${tier}`.cwd(tizen);
  setOutput('slices', 'clients/tizen/dist-*');
}

export async function main(argv: string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { slice: { type: 'boolean', default: false } },
  });
  const [name] = positionals;
  if (!isTarget(name)) {
    throw new Error(`usage: bun run ci build <${TARGET_NAMES.join('|')}> [--slice]`);
  }
  const target: Target = TARGETS[name];
  await $`bun run ${target.script}`.cwd(root);

  if (target.dist !== null) {
    if (!existsSync(join(root, target.dist))) throw new Error(`${name} left no ${target.dist}`);
    setOutput('dist', target.dist);
  }
  if (values.slice) {
    if (name !== 'tizen') throw new Error('--slice is a Tizen option');
    await sliceTizen();
  }
}
