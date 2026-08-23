import * as p from '@clack/prompts';
import type { Source } from '../install/artifact';
import { deployTo } from '../install/deploy';
import type { ModuleOptions } from '../modules/module';
import type { Television } from '../television';

const LOG_LINES = 8;

export interface InstallOptions {
  artifact?: string;
  source?: Source;
  launch: boolean;
  moduleOptions: ReadonlyMap<string, ModuleOptions>;
}

/** Returns the sets that failed. A set that fails never stops the run. */
export async function installSets(
  sets: readonly Television[],
  options: InstallOptions,
): Promise<Television[]> {
  const failed: Television[] = [];
  for (const tv of sets) {
    const task = p.taskLog({ title: `${tv.name} (${tv.host})`, limit: LOG_LINES });
    try {
      await deployTo(tv, {
        log: (line) => task.message(line),
        artifact: options.artifact,
        source: options.source,
        launch: options.launch,
        moduleOptions: options.moduleOptions.get(tv.host),
      });
      task.success(options.launch ? `${tv.name}: installed and launched` : `${tv.name}: installed`);
    } catch (error) {
      task.error(`${tv.name}: ${reason(error)}`, { showLog: true });
      failed.push(tv);
    }
  }
  return failed;
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
