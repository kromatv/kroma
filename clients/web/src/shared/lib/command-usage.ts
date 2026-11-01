import { z } from 'zod';

const MAX_ROWS = 120;
const MAX_QUERIES = 8;
const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;
const FRECENCY_CAP = 16;
const AFFINITY_BASE = 60;
const AFFINITY_STEP = 12;
const AFFINITY_CAP = 120;

const Usage = z.record(
  z.string(),
  z.object({
    uses: z.number(),
    last: z.number(),
    queries: z.record(z.string(), z.number()),
  }),
);

/** What this viewer chose through the menu on this device, and what they had typed. */
export type CommandUsage = z.infer<typeof Usage>;

const keyOf = (userId: string) => `kroma:command-menu:usage:${userId}`;

const normal = (query: string) => query.trim().toLowerCase();

/** What this viewer has chosen before. */
export function readCommandUsage(userId: string): CommandUsage {
  try {
    const parsed = Usage.safeParse(JSON.parse(localStorage.getItem(keyOf(userId)) ?? '{}'));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

function strongest(queries: Record<string, number>): Record<string, number> {
  const kept = Object.entries(queries).sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(kept.slice(0, MAX_QUERIES));
}

function latest(usage: CommandUsage): CommandUsage {
  const kept = Object.entries(usage).sort((a, b) => b[1].last - a[1].last);
  return Object.fromEntries(kept.slice(0, MAX_ROWS));
}

/** Remembers that a row was chosen after typing `query`. */
export function recordCommandUse(
  userId: string,
  id: string,
  query: string,
  now = Date.now(),
): void {
  const usage = readCommandUsage(userId);
  const entry = usage[id] ?? { uses: 0, last: now, queries: {} };
  const typed = normal(query);
  const queries = typed
    ? strongest({ ...entry.queries, [typed]: (entry.queries[typed] ?? 0) + 1 })
    : entry.queries;
  const next = latest({ ...usage, [id]: { uses: entry.uses + 1, last: now, queries } });
  try {
    localStorage.setItem(keyOf(userId), JSON.stringify(next));
  } catch {
    return;
  }
}

function frecency(uses: number, last: number, now: number): number {
  const decayed = uses * 0.5 ** (Math.max(0, now - last) / HALF_LIFE_MS);
  return Math.min(FRECENCY_CAP, 5 * Math.log2(1 + decayed));
}

function affinity(queries: Record<string, number>, typed: string): number {
  let best = 0;
  for (const [query, count] of Object.entries(queries)) {
    if (!query.startsWith(typed) && !typed.startsWith(query)) continue;
    const closeness = Math.min(typed.length, query.length) / Math.max(typed.length, query.length);
    best = Math.max(best, (AFFINITY_BASE + AFFINITY_STEP * count) * closeness);
  }
  return Math.min(AFFINITY_CAP, best);
}

/** How much a row rises for `query` because of what this viewer did before: a little for
 *  being used often and lately, and a lot for having been chosen after typing this. */
export function usageBoost(
  usage: CommandUsage,
  id: string,
  query: string,
  now = Date.now(),
): number {
  const entry = usage[id];
  if (!entry) return 0;
  return frecency(entry.uses, entry.last, now) + affinity(entry.queries, normal(query));
}
