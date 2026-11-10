import { basename } from 'node:path';
import type { ModuleOptions, TvModule } from '../modules/module';
import { moduleFor } from '../modules/registry';
import { type RememberedSet, rememberSet } from '../remembered';
import type { LogLine } from '../run';
import type { Television } from '../television';
import { installTool } from '../toolchain/install';
import type { Source } from './artifact';

export interface DeployOptions {
  log: LogLine;
  artifact?: string;
  launch?: boolean;
  source?: Source;
  moduleOptions?: ModuleOptions;
}

function repeated(module: TvModule, given: ModuleOptions = {}): RememberedSet['options'] {
  const kept: Record<string, string | boolean> = {};
  for (const name of module.remembers ?? []) {
    const value = given[name];
    if (value !== undefined) kept[name] = value;
  }
  return Object.keys(kept).length > 0 ? kept : undefined;
}

/**
 * Installs the toolchain the set's platform needs, puts KROMA on it, and
 * remembers what it installed there, so an update needs no question.
 */
export async function deployTo(tv: Television, options: DeployOptions): Promise<void> {
  const module = moduleFor(tv.platform);
  for (const tool of module.tools()) await installTool(tool, options.log);

  const artifact = await module.resolve({
    tv,
    given: options.artifact,
    source: options.source,
    log: options.log,
  });
  await module.install({
    tv,
    artifact,
    log: options.log,
    launch: options.launch ?? true,
    options: options.moduleOptions ?? {},
  });
  if (tv.identifier === undefined) {
    await rememberSet({
      host: tv.host,
      platform: tv.platform,
      name: tv.name,
      model: tv.model,
      package: basename(artifact),
      source: options.source,
      options: repeated(module, options.moduleOptions),
      installedAt: new Date().toISOString(),
    }).catch(() => undefined);
  }
}
