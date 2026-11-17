import { type Pass, passIfStale, passOver, trackProjects } from '#site/github/pass';
import { reader } from '#site/github/reader';
import type { Syncing } from '#site/github/sync';
import type { Project } from '#site/store/store';
import { chainOn } from './chain';
import { type Env, listedProjects, oauthCredentials, storeFor } from './env';
import { report } from './log';

const REQUESTS_PER_RUN = 45;

/** Who a run talks to and where it keeps what it read, with a fresh budget of GitHub requests, or null without a database. */
export async function syncingFor(env: Env, fetchFn: typeof fetch): Promise<Syncing | null> {
  if (!env.LINGUA_DB) {
    return null;
  }
  const allowance = { oauth: oauthCredentials(env), requests: REQUESTS_PER_RUN };
  return { reader: reader(allowance, fetchFn), store: await storeFor(env) };
}

const oldestCheckFirst = (a: Project, b: Project) => (a.checkedAt ?? 0) - (b.checkedAt ?? 0);

/** When a run happens, and the fetch it reads GitHub through: the platform's, unless a test gives its own. */
export interface Run {
  now: number;
  fetchFn?: typeof fetch;
}

function reportFailure(id: string, pass: Pass): void {
  if (pass.kind === 'failed') {
    report(`${id} did not sync`, pass.error);
  }
}

async function passesInTurn(syncing: Syncing, ids: readonly string[], now: number): Promise<void> {
  const [id, ...rest] = ids;
  if (id === undefined || syncing.reader.left < 1) {
    return;
  }
  reportFailure(id, await passOver(syncing, id, now));
  await passesInTurn(syncing, rest, now);
}

/**
 * The cron's run: hold every repository `LINGUA_PROJECTS` lists, then pass
 * over each one in turn, the longest unchecked first, while the run's budget
 * of GitHub requests lasts.
 */
export async function refreshAll(
  env: Env,
  now: number,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const syncing = await syncingFor(env, fetchFn);
  if (!syncing) {
    return;
  }
  for (const { id, error } of await trackProjects(syncing, listedProjects(env))) {
    report(`${id} could not be read`, error);
  }
  const projects = (await syncing.store.projects()).sort(oldestCheckFirst);
  const ids = projects.map((p) => p.id);
  await passesInTurn(syncing, ids, now);
  await Promise.all(ids.map((id) => chainOn(env, syncing.store, { id, hop: 1 })));
}

/** A page's run: pass over project `id` when its last pass ended more than two minutes ago. */
export async function refreshStale(env: Env, id: string, run: Run): Promise<void> {
  const syncing = await syncingFor(env, run.fetchFn ?? fetch);
  if (!syncing) {
    return;
  }
  await trackProjects(syncing, listedProjects(env));
  const pass = await passIfStale(syncing, id, run.now);
  reportFailure(id, pass);
  if (pass.kind === 'synced') {
    await chainOn(env, syncing.store, { id, hop: 1 });
  }
}

/** A chained run: one more pass over project `id`, then the next link while files are left to read. */
export async function refreshChained(
  env: Env,
  at: { id: string; hop: number },
  run: Run,
): Promise<void> {
  const syncing = await syncingFor(env, run.fetchFn ?? fetch);
  if (!syncing) {
    return;
  }
  const pass = await passOver(syncing, at.id, run.now);
  reportFailure(at.id, pass);
  if (pass.kind === 'synced') {
    await chainOn(env, syncing.store, at);
  }
}
