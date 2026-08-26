import type { Catalog, PluralCategory, PluralRule, TVars } from './types';

const RULES = new Map<string, Intl.PluralRules | null>();
const SUFFIX = /_(zero|one|two|few|many|other)$/;
const STEMS = new WeakMap<Catalog, ReadonlySet<string>>();

// Which keys in a catalog have plural variants at all. Roughly one key in a
// hundred does, so without this every message carrying a number probes two or
// three keys that were never going to exist, in every catalog of the chain.
// Walked once per catalog, on first use.
function stemsOf(catalog: Catalog): ReadonlySet<string> {
  let stems = STEMS.get(catalog);
  if (!stems) {
    const found = new Set<string>();
    for (const key of Object.keys(catalog)) {
      const suffix = SUFFIX.exec(key);
      if (suffix) found.add(key.slice(0, key.length - suffix[0].length));
    }
    stems = found;
    STEMS.set(catalog, stems);
  }
  return stems;
}

function rulesFor(locale: string): Intl.PluralRules | null {
  const cached = RULES.get(locale);
  if (cached !== undefined) return cached;
  let rules: Intl.PluralRules | null = null;
  try {
    rules = new Intl.PluralRules(locale);
  } catch {
    rules = null;
  }
  RULES.set(locale, rules);
  return rules;
}

/** The CLDR plural category `count` falls in for `locale`. Falls back to a
 *  one/other split where `Intl.PluralRules` is missing, which is the older
 *  television engines. Note that French puts 0 in `one` and English does not,
 *  so a server rendering the same catalog has to agree with this. */
export function selectCategory(locale: string, count: number, rule?: PluralRule): PluralCategory {
  if (rule) return rule(locale, count);
  return rulesFor(locale)?.select(count) ?? (count === 1 ? 'one' : 'other');
}

function variantIn(
  catalog: Catalog,
  locale: string,
  stem: string,
  n: number,
  rule?: PluralRule,
): string | undefined {
  if (!stemsOf(catalog).has(stem)) return undefined;
  // An explicit `_zero` wins at zero even where CLDR has no `zero` category,
  // because "no results" is usually its own sentence rather than a plural.
  if (n === 0 && catalog[`${stem}_zero`] !== undefined) return `${stem}_zero`;
  const category = `${stem}_${selectCategory(locale, n, rule)}`;
  if (catalog[category] !== undefined) return category;
  const other = `${stem}_other`;
  if (catalog[other] !== undefined) return other;
  return undefined;
}

/** The key `catalog` should be read at once the message's numeric variables
 *  have chosen a plural variant, or `key` itself when it declares none.
 *
 *  Resolution is per catalog rather than across a fallback chain, so a locale
 *  can never borrow another language's singular purely because that language
 *  happens to declare one; the caller moves on to the next catalog only when
 *  this one has no template at all.
 *
 *  `count` selects `key_one` / `key_other` / `key_zero`. Any other numeric
 *  variable selects `key_<name>_one` and so on, which is how a message whose
 *  quantity is not called "count" pluralises. Only one variable can select,
 *  since one key names one template: `count` is tried first, then the rest in
 *  declaration order. */
export function resolvePluralKey(
  catalog: Catalog,
  locale: string,
  key: string,
  vars: TVars,
  rule?: PluralRule,
): string {
  const count = vars.count;
  if (typeof count === 'number') {
    const hit = variantIn(catalog, locale, key, count, rule);
    if (hit) return hit;
  }
  for (const name in vars) {
    if (name === 'count' || !Object.hasOwn(vars, name)) continue;
    const value = vars[name];
    if (typeof value !== 'number') continue;
    const hit = variantIn(catalog, locale, `${key}_${name}`, value, rule);
    if (hit) return hit;
  }
  return key;
}
