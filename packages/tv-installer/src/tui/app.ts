import * as p from '@clack/prompts';
import type { Source } from '../install/artifact';
import { showBanner } from './banner';
import { askModules, chooseKinds, chooseVersion } from './choose';
import { discover } from './discover';
import { installSets } from './install-sets';
import { showSetup } from './setup';

const CANCELLED = 130;

export interface TuiOptions {
  hosts?: string[];
  artifact?: string;
  source?: Source;
  launch: boolean;
  version?: string;
}

/**
 * The guided install: which version, which kind of TV, what that TV needs
 * once, then the TVs as the scan finds them. A flag that already answers a
 * question skips it.
 */
export async function runTui(options: TuiOptions): Promise<number> {
  showBanner(options.version);

  const given = options.artifact !== undefined || options.source !== undefined;
  const source = given ? options.source : await chooseVersion();
  if (source === null) return cancelled();

  const platforms = options.hosts?.length ? undefined : await chooseKinds(source);
  if (platforms === null) return cancelled();
  if (platforms) showSetup(platforms);

  const chosen = await discover(options.hosts, platforms);
  if (chosen === null) return cancelled();
  if (chosen.length === 0) {
    p.outro('nothing to install onto');
    return 1;
  }

  const answers = await askModules(chosen);
  if (answers === null) return cancelled();

  const failed = await installSets(chosen, {
    artifact: options.artifact,
    source,
    launch: options.launch,
    moduleOptions: answers,
  });
  p.outro(summary(chosen.length, failed.length));
  return failed.length === 0 ? 0 : 1;
}

function cancelled(): number {
  p.cancel('nothing was installed');
  return CANCELLED;
}

function summary(total: number, failed: number): string {
  const sets = `${total} TV${total === 1 ? '' : 's'}`;
  if (failed === 0) return `KROMA is on ${sets}`;
  return `${total - failed} of ${sets} took KROMA, ${failed} failed`;
}
