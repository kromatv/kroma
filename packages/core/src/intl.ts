import type { Locale } from '@kromatv/i18n';

const BYTE_UNITS: Record<Locale, readonly string[]> = {
  fr: ['o', 'Ko', 'Mo', 'Go', 'To', 'Po'],
  en: ['B', 'KB', 'MB', 'GB', 'TB', 'PB'],
};

const FIXED = new Map<string, Intl.NumberFormat>();
const COUNTS = new Map<Locale, Intl.NumberFormat>();
const SHARES = new Map<Locale, Intl.NumberFormat>();

function cached<K>(store: Map<K, Intl.NumberFormat>, key: K, make: () => Intl.NumberFormat) {
  const found = store.get(key);
  if (found) return found;
  const made = make();
  store.set(key, made);
  return made;
}

export function decimal(n: number, locale: Locale, digits = 1): string {
  const format = cached(
    FIXED,
    `${locale}${digits}`,
    () =>
      new Intl.NumberFormat(locale, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
        useGrouping: false,
      }),
  );
  return format.format(n);
}

/** A byte size in the locale's units: `1,5 Go` in French, `1.5 GB` in English.
 *  Zero and negatives render as the smallest unit rather than empty. */
export function formatBytes(bytes: number, locale: Locale): string {
  const units = BYTE_UNITS[locale] ?? BYTE_UNITS.en;
  const smallest = units[0] ?? 'B';
  if (!bytes || bytes < 0) return `0 ${smallest}`;
  const step = Math.floor(Math.log(bytes) / Math.log(1024));
  const i = Math.max(0, Math.min(units.length - 1, step));
  const v = bytes / 1024 ** i;
  return `${decimal(v, locale, v >= 100 || i <= 1 ? 0 : 1)} ${units[i] ?? smallest}`;
}

export function formatCount(n: number, locale: Locale): string {
  return cached(
    COUNTS,
    locale,
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }),
  ).format(n);
}

/** A fraction of one as a share, rounded down so nothing reads finished before
 *  it is: `42 %` in French, `42%` in English. */
export function formatShare(fraction: number, locale: Locale): string {
  return cached(
    SHARES,
    locale,
    () => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }),
  ).format(Math.floor(Math.max(0, Math.min(1, fraction)) * 100) / 100);
}
