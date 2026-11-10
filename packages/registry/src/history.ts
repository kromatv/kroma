import { z } from 'zod';
import { buildVersion } from './build.ts';
import { RegistryVersion } from './documents/index.ts';
import type { DescribedModule } from './manifest/index.ts';
import { compareRaw } from './semver.ts';
import { byCodeUnit } from './sort.ts';

/** The shape of the history document this build writes and reads. */
export const HISTORY_SCHEMA = 1;

const Versions = z.record(z.string(), RegistryVersion);

/**
 * Every version a publisher has released, each as `GET /m/{id}.json` serves it
 * under `versions`. A catalog names only the newest version of each module; this
 * keeps the rest, so a client can judge an older version without downloading it.
 */
export const VersionHistory = z.object({
  schema: z.literal(HISTORY_SCHEMA),
  generatedAt: z.string().nullish(),
  modules: z.record(z.string(), Versions).default({}),
});
export type VersionHistory = z.infer<typeof VersionHistory>;

/** One module's versions in a history, newest first. */
export type HistoryVersions = z.infer<typeof Versions>;

function newestFirst(versions: HistoryVersions): HistoryVersions {
  const order = Object.keys(versions).sort(
    (left, right) => compareRaw(right, left) || byCodeUnit(left, right),
  );
  return Object.fromEntries(order.map((v) => [v, versions[v] as RegistryVersion]));
}

/**
 * `published` with every entry's own version folded in. Append-only: a version
 * already in the history keeps the record it was first written with, because a
 * published version's bytes never change.
 */
export function foldHistory(
  published: VersionHistory | null,
  entries: readonly DescribedModule[],
  now: string,
): VersionHistory {
  const modules = new Map<string, HistoryVersions>();
  for (const [id, versions] of Object.entries(published?.modules ?? {})) {
    modules.set(id, { ...versions });
  }
  for (const entry of entries) {
    const versions = modules.get(entry.id) ?? {};
    versions[entry.version] ??= buildVersion(entry);
    modules.set(entry.id, versions);
  }
  const ids = [...modules.keys()].sort(byCodeUnit);
  return {
    schema: HISTORY_SCHEMA,
    generatedAt: now,
    modules: Object.fromEntries(ids.map((id) => [id, newestFirst(modules.get(id) ?? {})])),
  };
}
