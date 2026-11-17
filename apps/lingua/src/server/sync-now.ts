import { z } from 'zod';
import { ProjectId } from '#site/core/config';
import { passOver, trackProjects } from '#site/github/pass';
import type { RepositoryStatus } from '#site/lib/views';
import { type Env, listedProjects } from './env';
import { syncingFor } from './scheduled';
import { statusOf } from './setup';

/** `POST /api/sync`: which repository to read now. */
export const SyncInput = z.object({ project: ProjectId });
export type SyncInput = z.infer<typeof SyncInput>;

/** What a sync asked for by hand came to: where the repository stands now, or why nothing ran. */
export type SyncNow =
  | { status: 200; repository: RepositoryStatus }
  | { status: 404 | 409 | 503; error: string };

/**
 * Pass over a listed repository right away, reading it the first time if it
 * never was, and say where its sync stands. One call reads as much as one
 * request may; a sync still `reading` goes on with the next call.
 */
export async function syncNow(env: Env, input: SyncInput, now: number, fetchFn: typeof fetch = fetch): Promise<SyncNow> {
  const listed = listedProjects(env).find((entry) => entry.id === input.project);
  if (!listed) {
    return { status: 404, error: 'Lingua does not translate this repository' };
  }
  const syncing = await syncingFor(env, fetchFn);
  if (!syncing) {
    return { status: 503, error: 'This deployment has no database' };
  }
  await trackProjects(syncing, listedProjects(env));
  const pass = await passOver(syncing, listed.id, now);
  if (pass.kind === 'skipped') {
    return { status: 409, error: 'A sync of this repository is already running' };
  }
  return { status: 200, repository: statusOf(listed, (await syncing.store.project(listed.id)) ?? undefined) };
}
