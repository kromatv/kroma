import type { Messages } from './catalog';

const CATEGORY = /_(zero|one|two|few|many|other)$/;

const COUNTED_BELOW = 1000;
const CLDR_ORDER = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;
const reachedBy = new Map<string, string[]>();

/**
 * The CLDR plural categories a count of things below 1 000 takes in `locale`,
 * `other` last. A category only fractions or millions reach, like French
 * `many` (« 1 000 000 de films »), is left out: the base message covers it.
 */
export function pluralCategories(locale: string): string[] {
  const held = reachedBy.get(locale);
  if (held) {
    return held;
  }
  const rules = new Intl.PluralRules(locale);
  const reached = new Set(Array.from({ length: COUNTED_BELOW }, (_, n) => rules.select(n)));
  const categories = [...CLDR_ORDER.filter((c) => c !== 'other' && reached.has(c)), 'other'];
  reachedBy.set(locale, categories);
  return categories;
}

/** One message a translator fills in: its key, the source text it renders, and the plural form it is. */
export interface Row {
  key: string;
  source: string;
  plural: string | null;
}

/**
 * The messages one language owes for one source file. A key the source gives
 * plural variants (`x_one` beside `x`) asks the language for the base, which
 * renders `other`, and one variant per other category that language has.
 */
export function rowsFor(source: Messages, locale: string): Row[] {
  const categories = pluralCategories(locale).filter((c) => c !== 'other');
  const rows: Row[] = [];
  for (const [key, text] of Object.entries(source)) {
    if (CATEGORY.test(key) && Object.hasOwn(source, key.replace(CATEGORY, ''))) {
      continue;
    }
    const plural = Object.keys(source).some(
      (k) => CATEGORY.test(k) && k.replace(CATEGORY, '') === key,
    );
    rows.push({ key, source: text, plural: plural ? 'other' : null });
    if (!plural) {
      continue;
    }
    for (const category of categories) {
      const variant = `${key}_${category}`;
      rows.push({ key: variant, source: source[variant] ?? text, plural: category });
    }
  }
  return rows;
}
