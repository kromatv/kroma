import { interpolate } from './interpolate';
import { resolvePluralKey } from './plural';
import type { Catalog, CatalogSource, PluralRule, TVars } from './types';

/** One catalog of a {@link Chain}, with the scope that added it and the
 *  language it speaks. */
export interface ChainLink extends CatalogSource {
  readonly catalog: Catalog;
}

/** The catalogs a lookup walks, most specific first. A scoped translator puts
 *  the scope's own catalogs ahead of the base ones, and each locale is followed
 *  by the locales it falls back to, the default one last. */
export type Chain = readonly ChainLink[];

/** Render `key` against `chain`, or `undefined` when no catalog in it knows the
 *  key. Plural variants are resolved inside the first catalog that answers, by
 *  the plural rules of that catalog's language, so a locale can never take a
 *  variant from a language whose template it will not also use. */
export function translateChain(
  chain: Chain,
  key: string,
  vars?: TVars,
  plural?: PluralRule,
): string | undefined {
  for (const link of chain) {
    const lookup = vars ? resolvePluralKey(link.catalog, link.locale, key, vars, plural) : key;
    const template = link.catalog[lookup];
    if (template !== undefined) {
      return interpolate(template, vars);
    }
  }
  return undefined;
}

/** What a lookup found: the catalog that answered, `undefined` when nothing
 *  did, and the message it rendered. */
export interface Resolved {
  readonly from: CatalogSource | undefined;
  readonly text: string | undefined;
}

/** Render `key` and say which catalog it came from, in one walk, which is what
 *  the key inspector reports. Kept apart from {@link translateChain} rather
 *  than wrapping it: the plain path runs for every string the app draws and
 *  does not allocate. */
export function resolveInChain(
  chain: Chain,
  key: string,
  vars?: TVars,
  plural?: PluralRule,
): Resolved {
  for (const link of chain) {
    const lookup = vars ? resolvePluralKey(link.catalog, link.locale, key, vars, plural) : key;
    const template = link.catalog[lookup];
    if (template !== undefined) {
      return {
        from: { scope: link.scope, locale: link.locale },
        text: interpolate(template, vars),
      };
    }
  }
  return { from: undefined, text: undefined };
}
