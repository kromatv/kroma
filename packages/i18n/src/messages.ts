import { tokensIn } from './interpolate.ts';
import type { Catalog, PluralCategory } from './types.ts';

export const PLURAL_CATEGORIES: readonly PluralCategory[] = [
  'zero',
  'one',
  'two',
  'few',
  'many',
  'other',
];

const VARIANT = /_(zero|one|two|few|many|other)$/;

/** The variable a plural variant of `count` selects on. */
export const COUNT = 'count';

/** What a plural variant key is a variant of: `item_one` selects `item` on
 *  `count`, and `item_seats_one` selects `item` on `seats`. */
export interface Variant {
  readonly base: string;
  readonly selector: string;
  readonly category: PluralCategory;
}

/** Read `key` as a plural variant of one of `bases`, or `null` when it is a
 *  message of its own. A key is only a variant where its base exists, so
 *  `status.other` and `type_other` with no `type` beside it stay messages. */
export function variantOf(key: string, bases: { has(key: string): boolean }): Variant | null {
  const suffix = VARIANT.exec(key);
  if (!suffix) return null;
  const category = suffix[1] as PluralCategory;
  const stem = key.slice(0, key.length - suffix[0].length);
  if (bases.has(stem)) return { base: stem, selector: COUNT, category };
  const cut = stem.lastIndexOf('_');
  if (cut === -1) return null;
  const base = stem.slice(0, cut);
  if (!bases.has(base)) return null;
  return { base, selector: stem.slice(cut + 1), category };
}

/** One message as a translator sees it: the key a screen names, and every
 *  template that answers it, the plural variants included. */
export interface Message {
  readonly key: string;
  /** Every template, by the catalog key that holds it. The base key is first. */
  readonly forms: Readonly<Record<string, string>>;
  /** The numeric variables its variants select on; empty when it has none. */
  readonly selectors: readonly string[];
}

/** The form a count falls to when its own category has no variant: the base
 *  key where the message has one, else its `_other`. */
export function generalForm(message: Message): string | undefined {
  return message.forms[message.key] ?? message.forms[`${message.key}_${OTHER}`];
}

const OTHER: PluralCategory = 'other';

// A plural written without a base key: `item_one` and `item_other` with no
// `item` beside them. The stem is still the key a caller names. A lone
// `kind_other` is not one: nothing says it is a plural at all.
function baselessStems(keys: ReadonlySet<string>): Set<string> {
  const categories = new Map<string, Set<string>>();
  for (const key of keys) {
    const suffix = VARIANT.exec(key);
    if (!suffix) continue;
    const stem = key.slice(0, key.length - suffix[0].length);
    if (keys.has(stem)) continue;
    const seen = categories.get(stem) ?? new Set();
    seen.add(suffix[1] as string);
    categories.set(stem, seen);
  }
  const stems = new Set<string>();
  for (const [stem, seen] of categories) {
    if (seen.has(OTHER) && seen.size > 1) stems.add(stem);
  }
  return stems;
}

/** The keys a caller names: every key of `catalog` that is a message in its
 *  own right, and the stem of every plural written without a base key. */
export function baseKeys(catalog: Catalog): Set<string> {
  const keys = new Set(Object.keys(catalog));
  const stems = baselessStems(keys);
  const known = new Set([...keys, ...stems]);
  const bases = new Set<string>(stems);
  for (const key of keys) {
    if (!variantOf(key, known)) bases.add(key);
  }
  return bases;
}

export interface Grouped {
  readonly messages: Map<string, Message>;
  /** Keys that are neither one of `bases` nor a variant of one. */
  readonly strays: string[];
}

/**
 * Fold a catalog's keys into messages. `bases` says which keys are messages:
 * the catalog's own by default, the source language's for a translation, so a
 * translation is read against the messages that exist rather than against
 * whatever it happens to spell.
 */
export function groupMessages(catalog: Catalog, bases: Set<string> = baseKeys(catalog)): Grouped {
  const forms = new Map<string, Record<string, string>>();
  const selectors = new Map<string, Set<string>>();
  const strays: string[] = [];
  const formsOf = (base: string) => {
    let own = forms.get(base);
    if (!own) {
      own = {};
      forms.set(base, own);
    }
    return own;
  };
  for (const key of Object.keys(catalog)) {
    if (bases.has(key)) formsOf(key)[key] = catalog[key] as string;
  }
  for (const [key, template] of Object.entries(catalog)) {
    if (bases.has(key)) continue;
    const variant = variantOf(key, bases);
    if (!variant) {
      strays.push(key);
      continue;
    }
    formsOf(variant.base)[key] = template;
    const own = selectors.get(variant.base) ?? new Set();
    own.add(variant.selector);
    selectors.set(variant.base, own);
  }
  const messages = new Map<string, Message>();
  for (const [key, own] of forms) {
    messages.set(key, { key, forms: own, selectors: [...(selectors.get(key) ?? [])] });
  }
  return { messages, strays };
}

/** What a caller passes to render a message: every `{token}` any of its forms
 *  names, and each selector as a number. */
export function variablesOf(message: Message): Map<string, 'number' | 'value'> {
  const variables = new Map<string, 'number' | 'value'>();
  for (const template of Object.values(message.forms)) {
    for (const name of tokensIn(template)) variables.set(name, 'value');
  }
  for (const selector of message.selectors) variables.set(selector, 'number');
  return variables;
}
