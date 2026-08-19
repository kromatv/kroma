import { dependenciesOf } from '@kroma/registry';
import type { ModuleEntry } from '#site/catalog';

export interface Dependency {
  id: string;
  range: string | null;
}

/** A module's required dependencies as rows. */
export function depEntries(m: ModuleEntry): Dependency[] {
  return Object.entries(dependenciesOf(m)).map(([id, range]) => ({ id, range }));
}
