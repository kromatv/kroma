import path from 'node:path';
import { offeredLocales } from '@kromatv/i18n/project';

/** The languages the product offers its readers, the source first: what a
 *  native build ships formatting data and a store localization for. */
export function productLocales(repoRoot: string): string[] {
  return offeredLocales(path.join(repoRoot, 'packages/core/src/locales'));
}
