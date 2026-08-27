import { interpolate } from './interpolate';
import { resolvePluralKey } from './plural';
import type { Catalog, PluralRule, TVars } from './types';

/** The catalogs a lookup walks, most specific first. A scoped translator puts
 *  the scope's own catalogs ahead of the base ones, and each locale is followed
 *  by the default locale it falls back to. */
export type Chain = readonly Catalog[];

/** Render `key` against `chain`, or `undefined` when no catalog in it knows the
 *  key. Plural variants are resolved inside the first catalog that answers, so
 *  a locale can never take a variant from a language whose template it will not
 *  also use. */
export function translateChain(
  chain: Chain,
  locale: string,
  key: string,
  vars?: TVars,
  plural?: PluralRule,
): string | undefined {
  for (const catalog of chain) {
    const lookup = vars ? resolvePluralKey(catalog, locale, key, vars, plural) : key;
    const template = catalog[lookup];
    if (template !== undefined) return interpolate(template, vars);
  }
  return undefined;
}

/** Where in `chain` {@link translateChain} would take the message from, or `-1`
 *  when nothing answers. Pairs with `CatalogStore.sources` to say which catalog
 *  spoke, which is what the key inspector reports. */
export function answeringIndex(
  chain: Chain,
  locale: string,
  key: string,
  vars?: TVars,
  plural?: PluralRule,
): number {
  let index = 0;
  for (const catalog of chain) {
    const lookup = vars ? resolvePluralKey(catalog, locale, key, vars, plural) : key;
    if (catalog[lookup] !== undefined) return index;
    index += 1;
  }
  return -1;
}
