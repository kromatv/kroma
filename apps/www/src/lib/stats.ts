import { site } from '@kromatv/site-meta';
import { z } from 'zod';

const Counts = z.record(z.string(), z.number());

/** What `stats.kroma.tv/v1/stats` publishes. Aggregates only: the collector has
 * no route that returns a row. */
export const Stats = z.object({
  instances: z.number(),
  clients: z.object({
    tv: z.number(),
    mobile: z.number(),
    desktop: z.number(),
    total: z.number(),
  }),
  versions: Counts,
  platforms: Counts,
  installs: Counts,
  countries: Counts,
  locales: Counts,
  modules: Counts,
  history: z.array(z.object({ day: z.string(), instances: z.number(), clients: z.number() })),
  updatedAt: z.number(),
});
export type Stats = z.infer<typeof Stats>;

export async function fetchStats(signal?: AbortSignal): Promise<Stats> {
  const res = await fetch(`${site.statsUrl}/v1/stats`, { signal });
  if (!res.ok) throw new Error(`the collector answered ${res.status}`);
  return Stats.parse(await res.json());
}
