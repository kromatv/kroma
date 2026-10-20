interface Shard {
  index: number;
  total: number;
}

/** `2/4` as a shard: one-based, like vitest and bun spell it. */
export function parseShard(spec: string): Shard {
  const match = /^(\d+)\/(\d+)$/.exec(spec);
  if (!match) throw new Error(`shard must be <index>/<total>, got '${spec}'`);
  const index = Number(match[1]);
  const total = Number(match[2]);
  if (total < 1 || index < 1 || index > total) {
    throw new Error(`shard ${index}/${total} is out of range`);
  }
  return { index, total };
}

/** The blob file vitest writes for a shard, under `.vitest-reports/`. */
export const blobName = ({ index, total }: Shard) => `blob-${index}-${total}.json`;

/** Every blob a run of `total` shards must leave behind. */
export function expectedBlobs(total: number): string[] {
  return Array.from({ length: total }, (_, i) => blobName({ index: i + 1, total }));
}

/**
 * From every blob artifact a run holds, the newest attempt of each shard: a
 * rerun of the failed jobs leaves the earlier attempt's artifact beside the
 * new one.
 */
export function newestAttempts(artifacts: readonly string[]): string[] {
  const newest = new Map<number, { attempt: number; name: string }>();
  for (const name of artifacts) {
    const match = /^vitest-blob-(\d+)-attempt-(\d+)$/.exec(name);
    if (!match) continue;
    const index = Number(match[1]);
    const attempt = Number(match[2]);
    const held = newest.get(index);
    if (!held || attempt > held.attempt) newest.set(index, { attempt, name });
  }
  return [...newest.entries()].sort(([a], [b]) => a - b).map(([, { name }]) => name);
}
