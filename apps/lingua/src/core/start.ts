import { labelKey, type Project, stageOf } from '@kromatv/i18n/model';
import { pathOf } from './config';
import { fill, inserted } from './fill';
import { policyLocales, withDraftLocale } from './policy';
import { localeFiles, localesOn, projectFile, type Shelf, writeCatalog } from './shelf';
import { fileOf, type Source, sourceOf } from './source';

/** What `language` is called in `inLocale`, capitalised as a heading, or null where Intl does not know it. */
export function nameOf(language: string, inLocale: string): string | null {
  try {
    const name = new Intl.DisplayNames([inLocale], { type: 'language' }).of(language);
    if (!name || name === language) {
      return null;
    }
    return name.charAt(0).toLocaleUpperCase(inLocale) + name.slice(1);
  } catch {
    return null;
  }
}

function readSource(shelf: Shelf, policy: Project): Source {
  return sourceOf(policy.source, localeFiles(shelf, policy.source));
}

function startEmpty(shelf: Shelf, source: Source, locale: string): void {
  const [file] = source.files.keys();
  if (file !== undefined) {
    writeCatalog(shelf, { locale, file, source: source.locale }, {});
  }
}

function nameEverywhere(shelf: Shelf, policy: Project, locale: string): void {
  const source = readSource(shelf, policy);
  const endonym = nameOf(locale, locale) ?? locale;
  const key = labelKey(locale);
  const file = fileOf(source, key);
  const spelled = (other: string) => localeFiles(shelf, other).get(file)?.[key] !== undefined;
  if (!spelled(source.locale)) {
    const named = inserted(
      source.files.get(file) ?? {},
      key,
      nameOf(locale, source.locale) ?? endonym,
    );
    writeCatalog(shelf, { locale: source.locale, file, source: source.locale }, named);
  }
  writeCatalog(shelf, { locale, file, source: source.locale }, { [key]: endonym });
  const stable = localesOn(shelf).filter(
    (other) =>
      other !== locale &&
      other !== source.locale &&
      !spelled(other) &&
      stageOf(policy, other) === 'stable',
  );
  const updated = readSource(shelf, policy);
  for (const other of stable) {
    fill(shelf, updated, { locale: other, entries: { [key]: nameOf(locale, other) ?? endonym } });
  }
}

/** Start `locale` as `i18n add` does and list it in `i18n.json` as a draft; false, writing nothing, when it exists. */
export function startLocale(shelf: Shelf, policy: Project, locale: string): boolean {
  const policyText = projectFile(shelf, 'policy');
  if (
    policyText === undefined ||
    [...localesOn(shelf), ...policyLocales(policy)].includes(locale)
  ) {
    return false;
  }
  const source = readSource(shelf, policy);
  if (source.catalog[labelKey(policy.source)] === undefined) {
    startEmpty(shelf, source, locale);
  } else {
    nameEverywhere(shelf, policy, locale);
  }
  const at = pathOf(shelf.root, { kind: 'policy', locale: '', file: '' });
  shelf.files.set(at, withDraftLocale(policyText, locale));
  return true;
}
