import {
  type Catalog,
  hasUnresolvedRef,
  LABEL_NAMESPACE,
  type Locale,
  type MessageKey,
  namespaceOf,
  SCHEMA_KEY,
} from '@kroma/i18n';
import { describe, expect, it } from 'vitest';
import { i18n } from '../i18n';
import { catalogs, lazy } from './catalogs';

interface GlobHost {
  glob(pattern: string, options: { eager: true; import: 'default' }): Record<string, Catalog>;
}

interface CatalogFile {
  readonly namespace: string;
  readonly locale: string;
  readonly catalog: Catalog;
}

// Written out in full and cast in place: Vite finds `import.meta.glob(...)` by
// matching the literal text, and this package keeps `vite/client` types out.
const ON_DISK = (import.meta as unknown as GlobHost).glob('./*/*.json', {
  eager: true,
  import: 'default',
});

const CATEGORY = /_(zero|one|two|few|many|other)$/;
const QUOTED = /\$t\(\s*([A-Za-z]+)\./g;

const files: CatalogFile[] = Object.entries(ON_DISK).map(([path, catalog]) => {
  const [locale = '', file = ''] = path.slice('./'.length).split('/');
  return { locale, namespace: file.replace(/\.json$/, ''), catalog };
});
const namespaces = [...new Set(files.map((file) => file.namespace))].sort();
const locales = [...new Set(files.map((file) => file.locale))].sort();

function messageKeys(catalog: Catalog): string[] {
  return Object.keys(catalog).filter((key) => key !== SCHEMA_KEY);
}

function baseKeys(catalog: Catalog): string[] {
  return messageKeys(catalog).filter((key) => !CATEGORY.test(key));
}

function stemOf(key: string): string {
  const stem = key.replace(CATEGORY, '');
  return stem.includes('_') ? stem.slice(0, stem.lastIndexOf('_')) : stem;
}

function fileOf(namespace: string, locale: string): Catalog {
  return files.find((f) => f.namespace === namespace && f.locale === locale)?.catalog ?? {};
}

describe('the catalog files', () => {
  it('each hold only keys of the namespace they are named after', () => {
    const strays = files.flatMap(({ namespace, locale, catalog }) =>
      messageKeys(catalog)
        .filter((key) => namespaceOf(key) !== namespace)
        .map((key) => `${locale}/${namespace}.json: ${key}`),
    );

    expect(strays).toEqual([]);
  });

  it('exist for every locale in every namespace', () => {
    const missing = namespaces.flatMap((namespace) =>
      locales
        .filter((locale) => !files.some((f) => f.namespace === namespace && f.locale === locale))
        .map((locale) => `${locale}/${namespace}.json`),
    );

    expect(missing).toEqual([]);
  });

  it('say the same things in every language', () => {
    const drift = namespaces.flatMap((namespace) => {
      const reference = new Set(baseKeys(fileOf(namespace, i18n.defaultLocale)));
      return locales.flatMap((locale) => {
        const own = baseKeys(fileOf(namespace, locale));
        return [
          ...own.filter((key) => !reference.has(key)).map((key) => `${locale} adds ${key}`),
          ...[...reference]
            .filter((key) => !own.includes(key))
            .map((key) => `${locale} lacks ${key}`),
        ];
      });
    });

    expect(drift).toEqual([]);
  });

  it('back every plural variant with a base key in the same file', () => {
    const orphans = files.flatMap(({ namespace, locale, catalog }) =>
      Object.keys(catalog)
        .filter((key) => CATEGORY.test(key) && catalog[stemOf(key)] === undefined)
        .map((key) => `${locale}/${namespace}.json: ${key}`),
    );

    expect(orphans).toEqual([]);
  });

  it('never quote a key outside their own namespace, since namespaces arrive one by one', () => {
    const crossings = files.flatMap(({ namespace, locale, catalog }) =>
      Object.entries(catalog).flatMap(([key, template]) =>
        [...template.matchAll(QUOTED)]
          .filter((match) => match[1] !== namespace)
          .map(() => `${locale}/${namespace}.json: ${key}`),
      ),
    );

    expect(crossings).toEqual([]);
  });
});

describe('the discovered catalogs', () => {
  it('ship only the language names up front, and offer every namespace on demand', () => {
    for (const locale of locales) {
      const shipped = new Set(Object.keys(catalogs[locale] ?? {}).map(namespaceOf));
      expect([...shipped]).toEqual([LABEL_NAMESPACE]);
    }
    expect(Object.keys(lazy).sort()).toEqual(namespaces);
  });

  it('fetch a namespace one locale at a time', async () => {
    // `lazy` is `{}` to the type checker: tsc reads the Metro half, which ships
    // every namespace eagerly and offers none.
    const sources = lazy as Record<string, Record<string, () => Promise<Catalog>>>;

    const nav = await sources.nav?.[i18n.defaultLocale]?.();

    expect(nav).toEqual(fileOf('nav', i18n.defaultLocale));
  });

  it('resolve every $t() reference they write', () => {
    for (const { namespace, locale, catalog } of files)
      i18n.register(namespace, { [locale]: catalog });

    const dangling = files.flatMap(({ locale, catalog }) =>
      messageKeys(catalog).filter((key) =>
        hasUnresolvedRef(i18n.translate(locale as Locale, key as MessageKey)),
      ),
    );

    expect(dangling).toEqual([]);
  });
});
