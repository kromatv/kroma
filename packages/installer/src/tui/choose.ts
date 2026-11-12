import * as p from '@clack/prompts';
import type { Source } from '../install/artifact';
import type { PlatformOptions } from '../platforms/platform';
import { platforms } from '../platforms/registry';
import type { Television } from '../shared/television';

const VERSIONS: Record<Source, { label: string; hint: string }> = {
  stable: { label: 'Stable', hint: 'the latest release, recommended' },
  canary: { label: 'Canary', hint: 'the newest build, less tested' },
  local: { label: 'Built here', hint: 'what this checkout built last' },
  build: { label: 'Build it now', hint: 'from this checkout, a few minutes' },
};
const ORDER: readonly Source[] = ['stable', 'canary', 'local', 'build'];
const EVERY_KIND = 'every';

/** The version to install, out of what at least one kind of TV can take. Null when cancelled. */
export async function chooseVersion(): Promise<Source | null> {
  const served = new Set(platforms().flatMap((module) => module.sources()));
  const chosen = await p.select({
    message: 'Which version of KROMA?',
    options: ORDER.filter((source) => served.has(source)).map((value) => ({
      value,
      ...VERSIONS[value],
    })),
    initialValue: 'stable' as Source,
  });
  return p.isCancel(chosen) ? null : chosen;
}

/**
 * The platforms to look for, out of those that take the version chosen. A
 * single one is answered without asking. Null when cancelled.
 */
export async function chooseKinds(source?: Source): Promise<string[] | null> {
  const kinds = platforms().filter((module) => !source || module.sources().includes(source));
  if (kinds.length <= 1) return kinds.map((module) => module.id);

  const chosen = await p.select({
    message: 'Which kind of TV?',
    options: [
      ...kinds.map((module) => ({
        value: module.id,
        label: module.label,
        hint: module.brands === module.label ? undefined : module.brands,
      })),
      { value: EVERY_KIND, label: 'Every kind' },
    ],
  });
  if (p.isCancel(chosen)) return null;
  return chosen === EVERY_KIND ? kinds.map((module) => module.id) : [chosen];
}

/** What the chosen sets still need from their own platforms, by host. Null when cancelled. */
export async function askPlatforms(
  sets: readonly Television[],
): Promise<Map<string, PlatformOptions> | null> {
  const answers = new Map<string, PlatformOptions>();
  for (const module of platforms()) {
    const mine = sets.filter((tv) => tv.platform === module.id);
    if (!module.prompt || mine.length === 0) continue;

    const given = await module.prompt(mine);
    if (given === null) return null;
    for (const [host, options] of given) answers.set(host, options);
  }
  return answers;
}
