// What the public page is allowed to see, and the rules that decide it.
//
// Nothing here reads a row out to a caller: every number below is a count over
// many installs, and a breakdown too small to be a crowd is dropped rather than
// published.

import type { DailyRow, InstanceRow } from './store';

const DAY = 86_400;

/** An install counts as running if it was heard from inside this window. */
export const ACTIVE_DAYS = 30;

/**
 * And only once it has been around this long. A fake fleet has to survive a
 * week before it moves the number, which is the difference between minting ids
 * and maintaining them.
 */
export const SETTLE_DAYS = 7;

/** No breakdown is published for fewer instances than this. */
export const FLOOR = 5;

/** One bar: what it names, and how many installs have it. */
export interface Counted {
  key: string;
  n: number;
}

interface Aggregate {
  instances: number;
  clients: { tv: number; mobile: number; desktop: number; total: number };
  versions: Counted[];
  platforms: Counted[];
  installs: Counted[];
  countries: Counted[];
  locales: Counted[];
  modules: Counted[];
  history: DailyRow[];
  updatedAt: number;
}

/** Heard from inside the active window. */
export function active(row: InstanceRow, now: number): boolean {
  return row.lastSeen >= now - ACTIVE_DAYS * DAY;
}

/** Active, but not around long enough to count yet. Not the same as dead: a row
 * that went quiet two months ago is neither counted nor settling. */
export function settling(row: InstanceRow, now: number): boolean {
  return !row.flagged && active(row, now) && row.firstSeen > now - SETTLE_DAYS * DAY;
}

/** The rows that count: heard from recently, around long enough to be real, and
 * not flagged by the nightly sweep. */
export function counted(rows: InstanceRow[], now: number): InstanceRow[] {
  return rows.filter(
    (row) => !row.flagged && active(row, now) && row.firstSeen <= now - SETTLE_DAYS * DAY,
  );
}

// One install counts once for a language or a module, however many of its
// devices ask for it: the number means "installs that have this", not "devices".
function unique(values: string[]): string[] {
  return [...new Set(values)];
}

// A Map, not an object: the keys are language tags and version strings off the
// wire, and `constructor` or `toString` read back as an inherited value that a
// `?? 0` never sees. `Accept-Language: constructor` is a one-line page-breaker.
function tally(values: Iterable<string>): Map<string, number> {
  const out = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    out.set(value, (out.get(value) ?? 0) + 1);
  }
  return out;
}

/**
 * Drop every entry that fewer than `floor` instances share, heaviest first. A
 * floor of 0 keeps everything, which only the Access-gated view asks for.
 *
 * An array of pairs rather than an object, because an object reorders keys that
 * look like array indices: a fork reporting `version: "2"` would jump to the
 * head of the chart whatever its count.
 */
export function floored(counts: Map<string, number>, floor: number = FLOOR): Counted[] {
  return [...counts]
    .filter(([, n]) => n >= floor)
    .sort(([a, na], [b, nb]) => nb - na || a.localeCompare(b))
    .map(([key, n]) => ({ key, n }));
}

// `aarch64-apple-darwin` -> `apple-darwin`: the OS is the interesting half, and
// the full triple narrows an install further than an aggregate needs to.
function platform(target: string): string {
  const parts = target.split('-');
  return parts.length > 1 ? parts.slice(1).join('-') : target;
}

export function aggregate(
  rows: InstanceRow[],
  history: DailyRow[],
  now: number,
  floor: number = FLOOR,
): Aggregate {
  const live = counted(rows, now);
  const clients = live.reduce(
    (sum, row) => ({
      tv: sum.tv + row.clients.tv,
      mobile: sum.mobile + row.clients.mobile,
      desktop: sum.desktop + row.clients.desktop,
    }),
    { tv: 0, mobile: 0, desktop: 0 },
  );
  return {
    instances: live.length,
    clients: { ...clients, total: clients.tv + clients.mobile + clients.desktop },
    versions: floored(tally(live.map((row) => row.version)), floor),
    platforms: floored(tally(live.map((row) => platform(row.target))), floor),
    installs: floored(tally(live.map((row) => row.install)), floor),
    countries: floored(tally(live.flatMap((row) => (row.country ? [row.country] : []))), floor),
    locales: floored(tally(live.flatMap((row) => unique(row.locales))), floor),
    modules: floored(tally(live.flatMap((row) => unique(row.modules))), floor),
    history,
    updatedAt: now,
  };
}
