import type { Counted } from './aggregate';

const DAY = 86_400;
const BUILD_EPOCH = Date.UTC(2020, 0, 1) / 1000;

const BANDS = [
  ['week', 7],
  ['month', 30],
  ['quarter', 90],
] as const;

/** Every band a build can fall in, newest first, in the order the page shows them. */
export const BUILD_AGES = ['week', 'month', 'quarter', 'older', 'source'] as const;
export type BuildAge = (typeof BUILD_AGES)[number];

/** How long before `now` a CI build was made, as a band; `source` for build 0. */
export function buildAge(build: number, now: number): BuildAge {
  if (build === 0) return 'source';
  const days = (now - (BUILD_EPOCH + build * 60)) / DAY;
  return BANDS.find(([, limit]) => days <= limit)?.[0] ?? 'older';
}

/** One row per band that has a server, in band order rather than by weight. */
export function buildAges(builds: readonly number[], now: number): Counted[] {
  const counts = new Map<BuildAge, number>();
  for (const build of builds) {
    const age = buildAge(build, now);
    counts.set(age, (counts.get(age) ?? 0) + 1);
  }
  return BUILD_AGES.flatMap((key) => {
    const n = counts.get(key);
    return n ? [{ key, n }] : [];
  });
}
