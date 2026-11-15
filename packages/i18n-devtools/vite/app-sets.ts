import { join, sep } from 'node:path';
import { type CatalogSet, REPO, workspace } from '@kromatv/i18n-tools';

const MODULES = 'modules';

/**
 * The sets the running app renders: its own, which the workspace lists first,
 * and each module's. Every other set of the workspace is another app's, the
 * website's among them, and is neither counted nor written from the panel.
 */
export function appSets(root: string = REPO): CatalogSet[] {
  const modules = join(root, MODULES) + sep;
  return workspace(root).filter((set, at) => at === 0 || set.dir.startsWith(modules));
}
