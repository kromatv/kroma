// Spotting a fleet. Not proof of anything: a public-source, self-hosted server
// cannot prove it is real, so the point is to make faking cost something and to
// leave what slips through visible and removable.

import { SETTLE_DAYS } from './aggregate';
import type { InstanceRow } from './store';

const DAY = 86_400;

// Ids appearing in the same minute wearing the same payload are one fleet.
const BURST_WINDOW_SECS = 60;

/** How many identical newcomers in that minute stop being a coincidence. */
export const BURST_LIMIT = 5;

// Version, platform, install method and both size bands. Real installs differ
// on at least one of these; a fleet minted from one image differs on none.
function fingerprint(row: InstanceRow): string {
  return [
    Math.floor(row.firstSeen / BURST_WINDOW_SECS),
    row.version,
    row.target,
    row.install,
    row.users,
    row.titles,
    row.clients.tv,
    row.clients.mobile,
    row.clients.desktop,
  ].join('|');
}

/**
 * The ids of rows that arrived as an identical crowd and have stayed identical.
 *
 * Sameness alone stopped meaning anything once statistics shipped on by default:
 * a release turns every existing install on at once, and a fresh install's
 * payload is identical by nature, with no devices yet and the smallest bands. So
 * a row is only considered once it is past the settling window, by which time a
 * real server has grown a library, a device or a language and a scripted one has
 * not. Nothing is lost by waiting: a settling row is not counted either way.
 *
 * Rows already flagged are left out, because they are flagged.
 */
export function burstIds(rows: InstanceRow[], now: number, limit: number = BURST_LIMIT): string[] {
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    if (row.flagged) continue;
    if (row.firstSeen > now - SETTLE_DAYS * DAY) continue;
    const key = fingerprint(row);
    groups.set(key, [...(groups.get(key) ?? []), row.id]);
  }
  return [...groups.values()]
    .filter((ids) => ids.length >= limit)
    .flat()
    .sort((a, b) => a.localeCompare(b));
}

/** The `YYYY-MM-DD` a unix second falls in, UTC. */
export function dayOf(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}
