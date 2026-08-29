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

/** What a lookup found: the index in the chain that answered, `-1` when
 *  nothing did, and the message it rendered. */
export interface Resolved {
  readonly at: number;
  readonly text: string | undefined;
}

/** Render `key` and say which catalog it came from, in one walk. Pairs with
 *  `CatalogStore.sources` to name the catalog that spoke, which is what the key
 *  inspector reports. Kept apart from {@link translateChain} rather than
 *  wrapping it: the plain path runs for every string the app draws and does not
 *  allocate. */
export function resolveInChain(
  chain: Chain,
  locale: string,
  key: string,
  vars?: TVars,
  plural?: PluralRule,
): Resolved {
  let index = 0;
  for (const catalog of chain) {
    const lookup = vars ? resolvePluralKey(catalog, locale, key, vars, plural) : key;
    const template = catalog[lookup];
    if (template !== undefined) return { at: index, text: interpolate(template, vars) };
    index += 1;
  }
  return { at: -1, text: undefined };
}
