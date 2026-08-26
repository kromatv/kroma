// Locale-aware rendering of values, next door to i18n.ts which renders
// messages. The split is what varies with the language: a separator or a unit
// symbol is a convention this file can hold, so those functions take a Locale
// and stay callable outside React. Anything with words in it takes a Translate
// instead and reads them from the catalogs, because the words belong to
// whoever writes the language, not to this file.

import type { Locale, Translate } from '@kroma/i18n';

const BYTE_UNITS: Record<Locale, readonly string[]> = {
  fr: ['o', 'Ko', 'Mo', 'Go', 'To', 'Po'],
  en: ['B', 'KB', 'MB', 'GB', 'TB', 'PB'],
};

const DATES = new Map<Locale, Intl.DateTimeFormat | null>();
const RELATIVE = new Map<Locale, Intl.RelativeTimeFormat | null>();

// `Intl.RelativeTimeFormat` is Chromium 71 and the legacy television tier
// floors at 53, so an absent one falls through to the absolute date rather
// than taking the app down.
function relativeFormat(locale: Locale): Intl.RelativeTimeFormat | null {
  const cached = RELATIVE.get(locale);
  if (cached !== undefined) return cached;
  let made: Intl.RelativeTimeFormat | null = null;
  try {
    made = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  } catch {
    made = null;
  }
  RELATIVE.set(locale, made);
  return made;
}
const NUMBERS = new Map<string, Intl.NumberFormat>();

function numberFormat(locale: Locale, digits: number): Intl.NumberFormat {
  const key = `${locale}${digits}`;
  const cached = NUMBERS.get(key);
  if (cached) return cached;
  const made = new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: false,
  });
  NUMBERS.set(key, made);
  return made;
}

// `dateStyle` is Chromium 76, and the legacy television tier runs engines older
// than that; Hermes without full ICU refuses it too. Both throw at construction
// rather than ignoring it, so the shape is tried once per locale and a plain
// numeric bag stands in.
function dateFormat(locale: Locale): Intl.DateTimeFormat | null {
  const cached = DATES.get(locale);
  if (cached !== undefined) return cached;
  let made: Intl.DateTimeFormat | null = null;
  try {
    made = new Intl.DateTimeFormat(locale, { dateStyle: 'short' });
  } catch {
    try {
      made = new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      made = null;
    }
  }
  DATES.set(locale, made);
  return made;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** A fixed-point number with the locale's decimal separator: `1,5` in French,
 *  `1.5` in English. Grouping is off: these sit in tabular columns beside a
 *  unit, where a thousands separator reads as a second number. */
export function decimal(n: number, locale: Locale, digits = 1): string {
  return numberFormat(locale, digits).format(n);
}

/** A byte size in the locale's units: `1,5 Go` in French, `1.5 GB` in English.
 *  Zero and negatives render as the smallest unit rather than empty. */
export function formatBytes(bytes: number, locale: Locale): string {
  const units = BYTE_UNITS[locale];
  const smallest = units[0] as string;
  if (!bytes || bytes < 0) return `0 ${smallest}`;
  // Clamped at both ends: a fractional byte count logs negative, and an
  // unclamped index would divide by 1024 to the minus one and read a
  // half-byte transfer rate back as 512.
  const step = Math.floor(Math.log(bytes) / Math.log(1024));
  const i = Math.max(0, Math.min(units.length - 1, step));
  const v = bytes / 1024 ** i;
  return `${decimal(v, locale, v >= 100 || i <= 1 ? 0 : 1)} ${units[i] ?? smallest}`;
}

/** A throughput figure, one decimal, no unit: the caller supplies `Mb/s`. */
export function formatMbps(n: number, locale: Locale): string {
  return decimal(n || 0, locale, 1);
}

/** A scrub-bar timecode, `1:04:07` or `4:07`, with no leading hours under one
 *  hour. Digits only, so no locale. */
export function formatTimecode(seconds: number): string {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** {@link formatTimecode} fed milliseconds, which is what the APIs return. */
export function formatTimecodeMs(ms: number): string {
  return formatTimecode((ms || 0) / 1000);
}

/** Hours with one decimal for a chart axis: `14,3 h`. */
export function formatHours(ms: number, locale: Locale): string {
  return `${decimal((ms || 0) / 3_600_000, locale, 1)} h`;
}

/** Watch time from milliseconds, to the minute: `4 h 29 min` / `65 min`. */
export function formatDuration(t: Translate, ms: number): string {
  const total = Math.round((ms || 0) / 60000);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return hours > 0
    ? t('format.durationHours', { hours, minutes: pad(minutes) })
    : t('format.durationMinutes', { minutes });
}

/** How long the server has been up, at the coarsest useful scale:
 *  `18 j 04 h` / `4 h 12 min` / `8 min`. */
export function formatUptime(t: Translate, seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return t('format.uptimeDays', { count: days, days, hours: pad(hours) });
  if (hours > 0) return t('format.uptimeHours', { hours, minutes: pad(minutes) });
  return t('format.uptimeMinutes', { minutes });
}

/** How long ago a timestamp was, in words, from an ISO string or epoch
 *  milliseconds: `il y a 5 min`, `hier`,
 *  `jamais` for a null. Beyond a month it becomes a short absolute date, since
 *  "il y a 74 j" is no longer something anyone counts. Takes `now` so a caller
 *  can pin it; tests should.
 *
 *  The ladder itself is `Intl.RelativeTimeFormat`, which already knows every
 *  language's wording and gives French "avant-hier" for free. Only the three
 *  cases it has no notion of are catalog keys: no timestamp at all, one it
 *  cannot read, and "just now" (it renders zero as the current unit, "this
 *  minute", rather than an elapsed one). */
export function formatElapsed(
  t: Translate,
  locale: Locale,
  at: string | number | null | undefined,
  now: number = Date.now(),
): string {
  if (at === null || at === undefined || at === '') return t('format.never');
  const then = typeof at === 'number' ? at : Date.parse(at);
  if (Number.isNaN(then)) return t('format.unknownTime');

  const minutes = Math.floor((now - then) / 60000);
  if (minutes < 1) return t('format.justNow');

  const relative = relativeFormat(locale);
  if (relative) {
    if (minutes < 60) return relative.format(-minutes, 'minute');
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return relative.format(-hours, 'hour');
    const days = Math.floor(hours / 24);
    if (days < 30) return relative.format(-days, 'day');
  }
  return dateFormat(locale)?.format(then) ?? new Date(then).toISOString().slice(0, 10);
}
