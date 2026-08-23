import * as p from '@clack/prompts';
import type { Source } from '../install/artifact';
import { style } from './ansi';
import { askModules, chooseSource } from './choose';
import { discover } from './discover';
import { installSets } from './install-sets';

const CANCELLED = 130;

export interface TuiOptions {
  hosts?: string[];
  artifact?: string;
  source?: Source;
  launch: boolean;
}

export async function runTui(options: TuiOptions): Promise<number> {
  p.intro(`${style.bold('KROMA')} television installer`);

  const chosen = await discover(options.hosts);
  if (chosen === null) return cancelled();
  if (chosen.length === 0) {
    p.outro('nothing to install onto');
    return 1;
  }

  const given = options.artifact !== undefined || options.source !== undefined;
  const source = given ? options.source : await chooseSource(chosen);
  if (source === null) return cancelled();

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
  const sets = `${total} set${total === 1 ? '' : 's'}`;
  if (failed === 0) return `KROMA is on ${sets}`;
  return `${total - failed} of ${sets} took KROMA, ${failed} failed`;
}
