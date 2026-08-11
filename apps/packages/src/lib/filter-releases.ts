import type { Release } from '#site/lib/release';

export function filterReleases(rows: readonly Release[], query: string): readonly Release[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((r) => `${r.version} ${r.channel} ${r.day}`.toLowerCase().includes(needle));
}
