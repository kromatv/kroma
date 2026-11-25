import { likelyRegion } from './likely-region';

const NO_ONE_COUNTRY: ReadonlySet<string> = new Set(['ar', 'zh-Hant']);

const REGION_SUBTAG = /^[a-z]{2,3}(?:-[a-z]{4})?-([a-z]{2}|\d{3})(?:-|$)/i;

const COUNTRY = /^[a-z]{2}$/i;

/** The ISO 3166 country whose flag stands for a language: the region its tag
 *  carries (`fr-CA` is `CA`), else the one CLDR finds it most likely written
 *  in (`en` is `US`, `pt` is `BR`, `zh-Hans` is `CN`), else `null`, where a
 *  picker draws no flag rather than a wrong one: a language no one country
 *  speaks for (Arabic, Traditional Chinese) or a tag that names no country
 *  (`es-419`). */
export function flagRegion(code: string): string | null {
  const named = REGION_SUBTAG.exec(code)?.[1];
  if (named) {
    return COUNTRY.test(named) ? named.toUpperCase() : null;
  }
  const [language = ''] = code.split('-');
  if (NO_ONE_COUNTRY.has(code) || NO_ONE_COUNTRY.has(language)) {
    return null;
  }
  return likelyRegion(code);
}
