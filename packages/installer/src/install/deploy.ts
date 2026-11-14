import { basename } from 'node:path';
import type { PlatformOptions, Platform } from '../platforms/platform';
import { platformFor } from '../platforms/registry';
import { type RememberedSet, rememberedSets, rememberSet } from './remembered';
import type { LogLine } from '../shared/run';
import type { Television } from '../shared/television';
import type { Source } from './artifact';

export interface DeployOptions {
  log: LogLine;
  artifact?: string;
  launch?: boolean;
  source?: Source;
  platformOptions?: PlatformOptions;
}

function repeated(module: Platform, given: PlatformOptions): RememberedSet['options'] {
  const kept: Record<string, string | boolean> = {};
  for (const name of module.remembers ?? []) {
    const value = given[name];
    if (value !== undefined) kept[name] = value;
  }
  return Object.keys(kept).length > 0 ? kept : undefined;
}

async function rememberedOptions(tv: Television): Promise<PlatformOptions> {
  const sets = await rememberedSets();
  const known = sets.find((set) => set.host === tv.host && set.platform === tv.platform);
  return known?.options ?? {};
}

/**
 * Puts KROMA on a set, with the package its platform resolves, and
 * remembers what it installed there, so the next install needs no question.
 * An option given here wins over the one remembered for that set.
 */
export async function deployTo(tv: Television, options: DeployOptions): Promise<void> {
  const module = platformFor(tv.platform);
  const platformOptions = { ...(await rememberedOptions(tv)), ...options.platformOptions };

  const artifact = await module.resolve({
    tv,
    given: options.artifact,
    source: options.source,
    options: platformOptions,
    log: options.log,
  });
  await module.install({
    tv,
    artifact,
    log: options.log,
    launch: options.launch ?? true,
    options: platformOptions,
  });
  if (tv.identifier === undefined) {
    await rememberSet({
      host: tv.host,
      platform: tv.platform,
      name: tv.name,
      model: tv.model,
      package: basename(artifact),
      source: options.source,
      options: repeated(module, platformOptions),
      installedAt: new Date().toISOString(),
    }).catch(() => undefined);
  }
}
