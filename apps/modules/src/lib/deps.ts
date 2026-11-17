import { dependenciesOf } from '@kromatv/registry';
import type { ModuleEntry } from '#site/catalog';

export interface Dependency {
  id: string;
  range: string | null;
}

/** A module's required dependencies as rows. */
export function depEntries(m: ModuleEntry): Dependency[] {
  return Object.entries(dependenciesOf(m)).map(([id, range]) => ({ id, range }));
}

const ENGINE_NAMES: Readonly<Record<string, string>> = {
  server: 'KROMA',
  host: 'module interface',
  core: 'core schema',
};

/** One `engines` entry as a card reads it: the server as KROMA, the two the
 *  build records by what they are, any other by its key. */
export function engineLabel(engine: string, range: string): string {
  return `${ENGINE_NAMES[engine] ?? engine} ${range}`;
}
