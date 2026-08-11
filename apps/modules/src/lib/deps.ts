import type { ModuleEntry } from '#site/catalog';

export interface Dependency {
  id: string;
  range: string | null;
}

/** Schema 2 emits a `{ id: range }` map; very old catalogs carried a bare array. */
export function depEntries(deps: ModuleEntry['dependsOn']): Dependency[] {
  if (Array.isArray(deps)) return deps.map((id) => ({ id, range: null }));
  if (!deps) return [];
  return Object.entries(deps).map(([id, range]) => ({ id, range }));
}
