import type { Lang } from '#site/lib/i18n';

/**
 * `2026-08-14` as the reader's own long date.
 *
 * Pinned to UTC because the input is a bare day, which `Date` reads as UTC
 * midnight: left to a local zone behind Greenwich it would render the day before.
 */
export function formatDay(day: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(day),
  );
}

/**
 * `2026-08-21T03:58:35Z` as the reader's own date and clock time, or null when
 * it is not an instant.
 *
 * In the reader's zone rather than UTC, unlike `formatDay`: this one is a moment
 * in time, and a build that landed at 03:58 UTC did not land at 03:58 for
 * someone in Tokyo. Several builds share a day, so the clock is what tells them
 * apart.
 */
export function formatMoment(iso: string | null | undefined, lang: Lang): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(at);
}

/** The month a timestamp falls in, as `2026-08`, or null for no timestamp. */
export function monthKey(at: string | null | undefined): string | null {
  if (!at) return null;
  const parsed = new Date(at);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 7);
}

/** `2026-08` as the reader's own month, pinned to UTC as `formatDay` is. */
export function formatMonth(key: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${key}-01`));
}

/**
 * Items under the month each was made in, keeping the order they came in.
 *
 * Items with no timestamp collect under a null key, so nothing is dropped for
 * being undated.
 */
export function groupByMonth<T>(
  items: readonly T[],
  at: (item: T) => string | null | undefined,
): { key: string | null; items: T[] }[] {
  const groups: { key: string | null; items: T[] }[] = [];
  for (const item of items) {
    const key = monthKey(at(item));
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, items: [item] });
  }
  return groups;
}
