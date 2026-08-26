// Spotting a fleet. Not proof of anything: a public-source, self-hosted server
// cannot prove it is real, so the point is to make faking cost something and to
// leave what slips through visible and removable.

import type { InstanceRow } from './store';

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

/** The ids of rows that arrived as an identical crowd, newest sweep wins. Rows
 * already flagged are left out: they are flagged. */
export function burstIds(rows: InstanceRow[], limit: number = BURST_LIMIT): string[] {
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    if (row.flagged) continue;
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
