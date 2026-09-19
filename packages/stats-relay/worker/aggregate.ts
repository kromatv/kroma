// What the public page is allowed to see, and the rules that decide it.
//
// Nothing here reads a row out to a caller: every number below is a count over
// installs, never an install.

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

/**
 * A total of accounts and titles is published once this many installs report a
 * size, so the sum is never one install's own library.
 */
export const SIZE_REPORTERS = 2;

/** One bar: what it names, and how many installs have it. */
export interface Counted {
  key: string;
  n: number;
}

/**
 * How many of the counted installs supplied each optional block. A breakdown is
 * over the servers that reported it, not over every server, and publishing the
 * denominator is what keeps that readable rather than misleading. `sizes` is
 * narrower than `statistics`: a server still on the banded shape reports its
 * devices and has no size.
 */
export interface Reports {
  usage: number;
  statistics: number;
  sizes: number;
}

/** Accounts and titles summed over the installs that report a size, or null
 * until `SIZE_REPORTERS` of them do. */
export interface Sizes {
  users: number;
  titles: number;
}

/** How many counted installs the edge could place in a country, and how many
 * countries that is. */
export interface Located {
  servers: number;
  countries: number;
}

interface Aggregate {
  instances: number;
  reports: Reports;
  clients: { tv: number; mobile: number; desktop: number; total: number };
  sizes: Sizes | null;
  located: Located;
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
 * Every entry, heaviest first, then by name. An array of pairs rather than an
 * object, because an object reorders keys that look like array indices: a fork
 * reporting `version: "2"` would jump to the head of the chart whatever its
 * count.
 */
export function ranked(counts: Map<string, number>): Counted[] {
  return [...counts]
    .sort(([a, na], [b, nb]) => nb - na || a.localeCompare(b))
    .map(([key, n]) => ({ key, n }));
}

// `x86_64-unknown-linux-musl` -> `linux-musl`, `aarch64-apple-darwin` ->
// `darwin`: the architecture narrows an install further than an aggregate needs
// to, and the vendor word of a Rust triple says nothing at all.
const VENDORS = new Set(['unknown', 'pc', 'apple', 'none']);

function platform(target: string): string {
  const [, second, ...rest] = target.split('-');
  if (second === undefined) return target;
  const os = VENDORS.has(second) ? rest : [second, ...rest];
  return os.join('-') || target;
}

function sum(rows: InstanceRow[], of: (row: InstanceRow) => number | undefined): number {
  return rows.reduce((total, row) => total + (of(row) ?? 0), 0);
}

function sizes(rows: InstanceRow[]): Sizes | null {
  const sized = rows.filter((row) => row.users !== undefined && row.titles !== undefined);
  if (sized.length < SIZE_REPORTERS) return null;
  return { users: sum(sized, (row) => row.users), titles: sum(sized, (row) => row.titles) };
}

export function aggregate(rows: InstanceRow[], history: DailyRow[], now: number): Aggregate {
  const live = counted(rows, now);
  const placed = live.flatMap((row) => (row.country ? [row.country] : []));
  const clients = live.reduce(
    (total, row) => ({
      tv: total.tv + (row.clients?.tv ?? 0),
      mobile: total.mobile + (row.clients?.mobile ?? 0),
      desktop: total.desktop + (row.clients?.desktop ?? 0),
    }),
    { tv: 0, mobile: 0, desktop: 0 },
  );
  return {
    instances: live.length,
    reports: {
      usage: live.filter((row) => row.modules !== undefined || row.locales !== undefined).length,
      statistics: live.filter((row) => row.clients !== undefined).length,
      sizes: live.filter((row) => row.users !== undefined && row.titles !== undefined).length,
    },
    clients: { ...clients, total: clients.tv + clients.mobile + clients.desktop },
    sizes: sizes(live),
    located: { servers: placed.length, countries: new Set(placed).size },
    versions: ranked(tally(live.map((row) => row.version))),
    platforms: ranked(tally(live.map((row) => platform(row.target)))),
    installs: ranked(tally(live.map((row) => row.install))),
    countries: ranked(tally(placed)),
    locales: ranked(tally(live.flatMap((row) => unique(row.locales ?? [])))),
    modules: ranked(tally(live.flatMap((row) => unique(row.modules ?? [])))),
    history,
    updatedAt: now,
  };
}
