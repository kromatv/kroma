import { basename } from 'node:path';
import { scan } from '../discovery/scan';
import type { Source } from '../install/artifact';
import { deployTo } from '../install/deploy';
import { askForLocalNetwork } from '../discovery/local-network';
import type { PlatformOptions } from '../platforms/platform';
import { platformFor } from '../platforms/registry';
import { type RememberedSet, rememberedSets } from '../install/remembered';
import type { Television } from '../shared/television';
import { style } from '../tui/ansi';

export interface UpdateOptions {
  source?: Source;
  platformOptions?: PlatformOptions;
  launch: boolean;
  force: boolean;
}

const log = (line: string) => console.log(style.dim(`  ${line}`));

async function updateSet(
  set: RememberedSet,
  tv: Television | undefined,
  options: UpdateOptions,
): Promise<void> {
  if (!tv) {
    throw new Error(
      `no set answers at ${set.host}: turn it on, or install on it again if its address changed`,
    );
  }
  const source = options.source ?? set.source ?? 'stable';
  const artifact = await platformFor(tv.platform).resolve({ tv, source, log });
  if (!options.force && basename(artifact) === set.package) {
    log(`already has ${set.package}`);
    return;
  }
  await deployTo(tv, {
    log,
    artifact,
    source,
    launch: options.launch,
    platformOptions: options.platformOptions,
  });
  console.log(style.green(`  updated to ${basename(artifact)}`));
}

/**
 * Puts the newest KROMA on every set this computer installed it on, asking
 * nothing. A set that already has the newest package is left alone, and each
 * set follows the channel it was installed from unless one is named.
 */
export async function updateCommand(options: UpdateOptions): Promise<number> {
  const sets = await rememberedSets();
  if (sets.length === 0) {
    console.log('no television is remembered yet: install KROMA on one first');
    return 1;
  }

  await askForLocalNetwork();
  const found = await scan({ hosts: sets.map((set) => set.host) });
  let failures = 0;
  for (const set of sets) {
    console.log(style.bold(`${set.name || set.model} (${set.host})`));
    const tv = found.find(
      (candidate) => candidate.host === set.host && candidate.platform === set.platform,
    );
    try {
      await updateSet(set, tv, options);
    } catch (error) {
      failures += 1;
      console.error(style.red(`  ${error instanceof Error ? error.message : String(error)}`));
    }
  }
  return failures === 0 ? 0 : 1;
}
