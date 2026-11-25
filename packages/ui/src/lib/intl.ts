// Locale-aware rendering of values, next door to i18n.ts which renders
// messages. What `Intl` cannot write, a unit symbol or a separator on an engine
// without it, is the language's own and comes from its catalogs.

import type { Locale, Translate } from '@kromatv/i18n';

/** The reader's language as a formatter needs it: the tag `Intl` formats in,
 *  and the translator whose catalogs write what `Intl` does not. */
export interface Language {
  readonly locale: Locale;
  readonly t: Translate;
}

const SIZES = [
  'format.size.bytes',
  'format.size.kilobytes',
  'format.size.megabytes',
  'format.size.gigabytes',
  'format.size.terabytes',
  'format.size.petabytes',
] as const;

const DATES = new Map<Locale, Intl.DateTimeFormat | null>();
const RELATIVE = new Map<Locale, Intl.RelativeTimeFormat | null>();

// `Intl.RelativeTimeFormat` is Chromium 71 and the legacy television tier
// floors at 53, so an absent one falls through to the absolute date rather
// than taking the app down.
function relativeFormat(locale: Locale): Intl.RelativeTimeFormat | null {
  const cached = RELATIVE.get(locale);
  if (cached !== undefined) {
    return cached;
  }
  let made: Intl.RelativeTimeFormat | null = null;
  try {
    made = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  } catch {
    made = null;
  }
  RELATIVE.set(locale, made);
  return made;
}

const NUMBER_SAMPLE = /^12(\D?)345(\D)6$/u;

interface Separators {
  readonly groupSeparator: string;
  readonly decimalSeparator: string;
}

function separators(t: Translate): Separators {
  const [, groupSeparator = ',', decimalSeparator = '.'] =
    NUMBER_SAMPLE.exec(t('format.numberSample')) ?? [];
  return { groupSeparator, decimalSeparator };
}

function built<T>(make: () => T): T | null {
  try {
    return make();
  } catch {
    return null;
  }
}

const NUMBERS = new Map<string, Intl.NumberFormat | null>();

function numberFormat(locale: Locale, digits: number): Intl.NumberFormat | null {
  const key = `${locale}${digits}`;
  const cached = NUMBERS.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const made = built(
    () =>
      new Intl.NumberFormat(locale, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
        useGrouping: false,
      }),
  );
  NUMBERS.set(key, made);
  return made;
}

const COUNTS = new Map<Locale, Intl.NumberFormat | null>();

function groupDigits(n: number, { groupSeparator, decimalSeparator }: Separators): string {
  const [whole = '', fraction] = String(Math.abs(n)).split('.');
  const head = whole.length % 3 || 3;
  const groups = [whole.slice(0, head)];
  for (let at = head; at < whole.length; at += 3) {
    groups.push(whole.slice(at, at + 3));
  }
  const tail = fraction ? `${decimalSeparator}${fraction.slice(0, 3)}` : '';
  return `${n < 0 ? '-' : ''}${groups.join(groupSeparator)}${tail}`;
}

/** A count with the locale's grouping: `1 064` in French, `1,064` in English. */
export function formatCount({ locale, t }: Language, n: number): string {
  let made = COUNTS.get(locale);
  if (made === undefined) {
    made = built(() => new Intl.NumberFormat(locale));
    COUNTS.set(locale, made);
  }
  return made?.format(n) ?? groupDigits(n, separators(t));
}

// `dateStyle` is Chromium 76, and the legacy television tier runs engines older
// than that; Hermes without full ICU refuses it too. Both throw at construction
// rather than ignoring it, so the shape is tried once per locale and a plain
// numeric bag stands in.
function dateFormat(locale: Locale): Intl.DateTimeFormat | null {
  const cached = DATES.get(locale);
  if (cached !== undefined) {
    return cached;
  }
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
export function decimal({ locale, t }: Language, n: number, digits = 1): string {
  return (
    numberFormat(locale, digits)?.format(n) ??
    n.toFixed(digits).replace('.', separators(t).decimalSeparator)
  );
}

const CLOCKS = new Map<'device', Intl.DateTimeFormat | null>();

/** The wall clock's reading, `20:15`: 24-hour, two-digit, in the device's
 *  locale, falling back to plain digits on an engine without `Intl`. */
export function formatClock(date: Date): string {
  let clock = CLOCKS.get('device');
  if (clock === undefined) {
    clock = built(
      () =>
        new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }),
    );
    CLOCKS.set('device', clock);
  }
  return clock?.format(date) ?? `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A byte size in the locale's units: `1,5 Go` in French, `1.5 GB` in English.
 *  Zero and negatives render as the smallest unit rather than empty. */
export function formatBytes(language: Language, bytes: number): string {
  const counted = Math.max(bytes || 0, 0);
  // Clamped at both ends: a fractional byte count logs negative, and an
  // unclamped index would divide by 1024 to the minus one and read a
  // half-byte transfer rate back as 512.
  const step = Math.floor(Math.log(counted) / Math.log(1024));
  const i = Math.max(0, Math.min(SIZES.length - 1, step));
  const v = counted / 1024 ** i;
  const size = decimal(language, v, v >= 100 || i <= 1 ? 0 : 1);
  return language.t(SIZES[i] ?? SIZES[0], { size });
}

/** A size already counted in gigabytes, such as a budget a reader picks, in
 *  the locale's unit and without a forced decimal: `40 Go` in French, `40 GB`
 *  in English. {@link formatBytes} is for a measured byte count. */
export function formatGigabytes(language: Language, gigabytes: number): string {
  return language.t('format.size.gigabytes', { size: formatCount(language, gigabytes) });
}

/** A throughput figure, one decimal, no unit: the caller supplies `Mb/s`. */
export function formatMbps(language: Language, n: number): string {
  return decimal(language, n || 0, 1);
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

/** Hours with one decimal for a chart axis, the unit from the catalog: `14,3 h`. */
export function formatHours(language: Language, ms: number): string {
  return language.t('format.hours', { hours: decimal(language, (ms || 0) / 3_600_000, 1) });
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
  if (days > 0) {
    return t('format.uptimeDays', { days, hours: pad(hours) });
  }
  if (hours > 0) {
    return t('format.uptimeHours', { hours, minutes: pad(minutes) });
  }
  return t('format.uptimeMinutes', { minutes });
}

const STAMPS = new Map<Locale, Intl.DateTimeFormat | null>();

// Same shape as `dateFormat`: built once per locale, and a runtime that refuses
// the option bag falls back rather than throwing at a call site.
function stampFormat(locale: Locale): Intl.DateTimeFormat | null {
  const cached = STAMPS.get(locale);
  if (cached !== undefined) {
    return cached;
  }
  let made: Intl.DateTimeFormat | null = null;
  try {
    made = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    made = null;
  }
  STAMPS.set(locale, made);
  return made;
}

/** A timestamp written out in full: the date and the time of day, in the
 *  locale's own order. Where [`formatElapsed`] answers "how long ago", this
 *  answers "when", which is what a log wants: two rows a minute apart both read
 *  "2 days ago", and a reader auditing a history needs to tell them apart. */
export function formatStamp(locale: Locale, at: string | number | null | undefined): string | null {
  if (at === null || at === undefined || at === '') {
    return null;
  }
  const then = typeof at === 'number' ? at : Date.parse(at);
  if (Number.isNaN(then)) {
    return null;
  }
  return (
    stampFormat(locale)?.format(then) ?? new Date(then).toISOString().slice(0, 16).replace('T', ' ')
  );
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
  { locale, t }: Language,
  at: string | number | null | undefined,
  now: number = Date.now(),
): string {
  if (at === null || at === undefined || at === '') {
    return t('format.never');
  }
  const then = typeof at === 'number' ? at : Date.parse(at);
  if (Number.isNaN(then)) {
    return t('format.unknownTime');
  }

  const minutes = Math.floor((now - then) / 60000);
  if (minutes < 1) {
    return t('format.justNow');
  }

  const relative = relativeFormat(locale);
  if (relative) {
    if (minutes < 60) {
      return relative.format(-minutes, 'minute');
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return relative.format(-hours, 'hour');
    }
    const days = Math.floor(hours / 24);
    if (days < 30) {
      return relative.format(-days, 'day');
    }
  }
  return dateFormat(locale)?.format(then) ?? new Date(then).toISOString().slice(0, 10);
}
