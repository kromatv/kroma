import type { ModuleOptions } from '../modules/module';
import { moduleFor } from '../modules/registry';
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

/** Installs the toolchain the set's platform needs, then puts KROMA on it. */
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
}
