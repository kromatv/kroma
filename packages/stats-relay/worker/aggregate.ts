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

interface Aggregate {
  instances: number;
  clients: { tv: number; mobile: number; desktop: number; total: number };
  versions: Record<string, number>;
  platforms: Record<string, number>;
  installs: Record<string, number>;
  countries: Record<string, number>;
  locales: Record<string, number>;
  modules: Record<string, number>;
  history: DailyRow[];
  updatedAt: number;
}

/** The rows that count: heard from recently, around long enough to be real, and
 * not flagged by the nightly sweep. */
export function counted(rows: InstanceRow[], now: number): InstanceRow[] {
  return rows.filter(
    (row) =>
      !row.flagged &&
      row.lastSeen >= now - ACTIVE_DAYS * DAY &&
      row.firstSeen <= now - SETTLE_DAYS * DAY,
  );
}

// One install counts once for a language or a module, however many of its
// devices ask for it: the number means "installs that have this", not "devices".
function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function tally(values: Iterable<string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) {
    if (!value) continue;
    out[value] = (out[value] ?? 0) + 1;
  }
  return out;
}

/** Drop every entry that fewer than `floor` instances share, and order what
 * survives by weight. A floor of 0 keeps everything, which only the
 * Access-gated view asks for. */
export function floored(
  counts: Record<string, number>,
  floor: number = FLOOR,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(counts)
      .filter(([, n]) => n >= floor)
      .sort(([a, na], [b, nb]) => nb - na || a.localeCompare(b)),
  );
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
