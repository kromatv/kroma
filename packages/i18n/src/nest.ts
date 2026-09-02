import type { Catalog } from './types';

const REF = /\$t\(\s*([\w.-]+)\s*\)/g;
const ANY_REF = /\$t\(\s*[\w.-]+\s*\)/;

function quotes(template: string): boolean {
  return template.includes('$t(');
}

/** Whether a template still names a key, i.e. {@link expandRefs} could not
 *  resolve it. A catalog that ships one of these has a typo or a cycle. */
export function hasUnresolvedRef(template: string): boolean {
  return ANY_REF.test(template);
}

function firstTemplate(chain: readonly Catalog[], key: string): string | undefined {
  for (const catalog of chain) {
    const template = catalog[key];
    if (template !== undefined) return template;
  }
  return undefined;
}

function resolveOne(
  key: string,
  chain: readonly Catalog[],
  done: Map<string, string>,
  visiting: Set<string>,
): string | undefined {
  const cached = done.get(key);
  if (cached !== undefined) return cached;
  if (visiting.has(key)) return undefined;

  const template = firstTemplate(chain, key);
  if (template === undefined) return undefined;

  visiting.add(key);
  const expanded = template.replace(REF, (whole, ref: string) => {
    return resolveOne(ref, chain, done, visiting) ?? whole;
  });
  visiting.delete(key);

  done.set(key, expanded);
  return expanded;
}

function defined(catalog: Catalog | undefined): catalog is Catalog {
  return catalog !== undefined;
}

/** Expand `$t(other.key)` references inside catalog values, once, so a term
 *  written in one place reads the same everywhere it is quoted.
 *
 *  A reference resolves against its own locale first, then the default locale,
 *  then the same two in `against`: the catalogs already built, for a part that
 *  arrives later. One that names a missing key, or that closes a cycle, is left
 *  standing as `$t(...)` rather than throwing: a catalog is data, and a bad
 *  entry must not take the app down at import. Guard the shipped catalogs with
 *  {@link hasUnresolvedRef} in a test instead.
 *
 *  Runs at construction, never per translation, which is what lets
 *  interpolation stay a single pass. */
export function expandRefs<C extends Record<string, Record<string, string>>>(
  catalogs: C,
  defaultLocale: keyof C & string,
  against?: Readonly<Record<string, Catalog | undefined>>,
): C {
  const cats = catalogs as Record<string, Catalog | undefined>;
  const fallback = cats[defaultLocale] ?? {};
  const out: Record<string, Catalog> = {};

  for (const [locale, catalog] of Object.entries(cats)) {
    if (!catalog) continue;
    // A catalog that quotes nothing is handed back as it came. Most are: this
    // runs at import, over every key of every locale, and rebuilding a few
    // thousand properties to reproduce them exactly is the kind of cost that
    // only shows up on a television.
    if (!Object.values(catalog).some(quotes)) {
      out[locale] = catalog;
      continue;
    }
    const chain = [catalog, fallback, against?.[locale], against?.[defaultLocale]].filter(defined);
    const done = new Map<string, string>();
    const visiting = new Set<string>();
    const expanded: Record<string, string> = {};
    for (const [key, template] of Object.entries(catalog)) {
      expanded[key] = quotes(template)
        ? (resolveOne(key, chain, done, visiting) ?? template)
        : template;
    }
    out[locale] = expanded;
  }

  return out as unknown as C;
}
