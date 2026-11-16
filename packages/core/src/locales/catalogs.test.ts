import {
  type Catalog,
  hasUnresolvedRef,
  LABEL_NAMESPACE,
  type Locale,
  type MessageKey,
  parseCatalogPath,
} from '@kromatv/i18n';
import { describe, expect, it } from 'vitest';
import { i18n } from '../i18n';
import { catalogs, lazy, names } from './catalogs';

interface GlobHost {
  glob(pattern: string, options: { eager: true; import: 'default' }): Record<string, Catalog>;
}

interface CatalogFile {
  readonly file: string;
  readonly locale: string;
  readonly catalog: Catalog;
}

// Written out in full and cast in place: Vite finds `import.meta.glob(...)` by
// matching the literal text, and this package keeps `vite/client` types out.
const ON_DISK = (import.meta as unknown as GlobHost).glob('./*/**/*.json', {
  eager: true,
  import: 'default',
});

const files: CatalogFile[] = Object.entries(ON_DISK).flatMap(([path, catalog]) => {
  const at = parseCatalogPath(path);
  return at ? [{ locale: at.locale, file: at.file, catalog }] : [];
});
const locales = [...new Set(files.map((file) => file.locale))].sort();

function fileOf(file: string, locale: string): Catalog {
  return files.find((f) => f.file === file && f.locale === locale)?.catalog ?? {};
}

describe('the discovered catalogs', () => {
  it('ship no catalog up front, name every language, and offer every file on demand', () => {
    expect(catalogs).toEqual({});
    expect(Object.keys(names ?? {}).sort()).toEqual(locales);
    expect(names?.[i18n.defaultLocale]).toBe(
      fileOf(LABEL_NAMESPACE, i18n.defaultLocale)[`lang.${i18n.defaultLocale}`],
    );
    expect(Object.keys(lazy).sort()).toEqual([...new Set(files.map((file) => file.file))].sort());
  });

  it('fetch a file one locale at a time', async () => {
    // `lazy` is `{}` to the type checker: tsc reads the Metro half, which ships
    // every namespace eagerly and offers none.
    const sources = lazy as Record<string, Record<string, () => Promise<Catalog>>>;

    const nav = await sources.nav?.[i18n.defaultLocale]?.();

    expect(nav).toEqual(fileOf('nav', i18n.defaultLocale));
  });

  it('resolve every $t() reference they write', () => {
    for (const { file, locale, catalog } of files) {
      i18n.register(file, { [locale]: catalog });
    }

    const dangling = files.flatMap(({ locale, catalog }) =>
      Object.keys(catalog).filter((key) =>
        hasUnresolvedRef(i18n.translator(locale as Locale)(key as MessageKey)),
      ),
    );

    expect(dangling).toEqual([]);
  });
});
