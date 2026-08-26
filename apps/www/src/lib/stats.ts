import { site } from '@kromatv/site-meta';
import { z } from 'zod';

const Counted = z.array(z.object({ key: z.string(), n: z.number() }));

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
  versions: Counted,
  platforms: Counted,
  installs: Counted,
  countries: Counted,
  locales: Counted,
  modules: Counted,
  history: z.array(z.object({ day: z.string(), instances: z.number(), clients: z.number() })),
  updatedAt: z.number(),
});
export type Stats = z.infer<typeof Stats>;

// The collector is a different service on a different host, so it gets the same
// treatment the site gives every other one: a deadline, and a ceiling on how
// much of an answer is read before it is parsed.
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 512 * 1024;

export async function fetchStats(signal?: AbortSignal): Promise<Stats> {
  const deadline = AbortSignal.timeout(TIMEOUT_MS);
  const res = await fetch(`${site.statsUrl}/v1/stats`, {
    signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
  });
  if (!res.ok) throw new Error(`the collector answered ${res.status}`);
  const body = await res.text();
  if (body.length > MAX_BYTES) throw new Error('the collector answered with too much');
  return Stats.parse(JSON.parse(body));
}
