import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { renderModuleTypes } from '@kromatv/i18n/model';
import { writeCatalogTypes } from '@kromatv/i18n/vite';
import { type CatalogSet, keepsPolicy, localesOf } from './set.ts';
import { readSource } from './status.ts';

function writeModuleTypes(set: CatalogSet, types: NonNullable<CatalogSet['types']>): boolean {
  if (!localesOf(set).includes(set.project.source)) return false;
  const next = renderModuleTypes(readSource(set).catalog, types.target);
  const current = existsSync(types.path) ? readFileSync(types.path, 'utf8') : null;
  if (current === next) return false;
  writeFileSync(types.path, next);
  return true;
}

/** Write the key declaration of every set that keeps one: a module's where
 *  its `types` say, in either layout, and the app's beside the `i18n.json` it
 *  is rendered from. Returns the paths that moved. */
export function writeTypes(sets: readonly CatalogSet[]): string[] {
  const moved: string[] = [];
  for (const set of sets) {
    if (set.types) {
      if (writeModuleTypes(set, set.types)) moved.push(set.types.path);
    } else if (keepsPolicy(set)) {
      const { path, changed } = writeCatalogTypes(set.dir);
      if (changed) moved.push(path);
    }
  }
  return moved;
}
