import * as p from '@clack/prompts';
import type { Source } from '../install/artifact';
import type { ModuleOptions } from '../modules/module';
import { moduleFor, modules } from '../modules/registry';
import type { Television } from '../television';

const SOURCE_LABELS: Record<Source, { label: string; hint: string }> = {
  local: { label: 'the build in this checkout', hint: 'whatever was built here last' },
  stable: { label: 'the latest release', hint: 'what everyone else runs' },
  canary: { label: 'the canary build', hint: 'newest, straight off main, less tested' },
  build: { label: 'build it now from source', hint: 'a few minutes' },
};

/**
 * Where the package comes from, out of the sources every chosen platform can serve.
 * Undefined means the default: the newest build here, else the latest release.
 */
export async function chooseSource(
  sets: readonly Television[],
): Promise<Source | undefined | null> {
  const platforms = [...new Set(sets.map((tv) => tv.platform))];
  const [first = [], ...rest] = platforms.map((platform) => [...moduleFor(platform).sources()]);
  const shared = rest.reduce(
    (all, sources) => all.filter((source) => sources.includes(source)),
    first,
  );
  if (shared.length === 0) return undefined;

  const chosen = await p.select({
    message: 'which package',
    options: shared.map((source) => ({ value: source, ...SOURCE_LABELS[source] })),
    initialValue: shared[0],
  });
  return p.isCancel(chosen) ? null : chosen;
}

/** What the chosen sets still need from their own modules, by host. Null when cancelled. */
export async function askModules(
  sets: readonly Television[],
): Promise<Map<string, ModuleOptions> | null> {
  const answers = new Map<string, ModuleOptions>();
  for (const module of modules()) {
    const mine = sets.filter((tv) => tv.platform === module.id);
    if (!module.prompt || mine.length === 0) continue;

    const given = await module.prompt(mine);
    if (given === null) return null;
    for (const [host, options] of given) answers.set(host, options);
  }
  return answers;
}
