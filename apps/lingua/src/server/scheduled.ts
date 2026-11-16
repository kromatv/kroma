import { type Pass, passIfStale, passOver, trackProjects } from '#site/github/pass';
import { reader } from '#site/github/reader';
import type { Syncing } from '#site/github/sync';
import type { Project } from '#site/store/store';
import { chainOn } from './chain';
import { type Env, listedProjects, oauthCredentials, storeFor } from './env';

const REQUESTS_PER_RUN = 45;

/** Who a run talks to and where it keeps what it read, with a fresh budget of GitHub requests, or null without a database. */
export async function syncingFor(env: Env, fetchFn: typeof fetch): Promise<Syncing | null> {
  if (!env.LINGUA_DB) return null;
  const allowance = { oauth: oauthCredentials(env), requests: REQUESTS_PER_RUN };
  return { reader: reader(allowance, fetchFn), store: await storeFor(env) };
}

const oldestCheckFirst = (a: Project, b: Project) => (a.checkedAt ?? 0) - (b.checkedAt ?? 0);

function logFailure(id: string, pass: Pass): void {
  if (pass.kind === 'failed') console.error(`lingua: ${id} did not sync`, pass.error);
}

async function passesInTurn(syncing: Syncing, ids: readonly string[], now: number): Promise<void> {
  const [id, ...rest] = ids;
  if (id === undefined || syncing.reader.left < 1) return;
  logFailure(id, await passOver(syncing, id, now));
  await passesInTurn(syncing, rest, now);
}

/**
 * The cron's run: hold every repository `LINGUA_PROJECTS` lists, then pass
 * over each one in turn, the longest unchecked first, while the run's budget
 * of GitHub requests lasts.
 */
export async function refreshAll(env: Env, now: number, fetchFn: typeof fetch = fetch): Promise<void> {
  const syncing = await syncingFor(env, fetchFn);
  if (!syncing) return;
  for (const { id, error } of await trackProjects(syncing, listedProjects(env))) {
    console.error(`lingua: ${id} could not be read`, error);
  }
  const projects = (await syncing.store.projects()).sort(oldestCheckFirst);
  await passesInTurn(syncing, projects.map((p) => p.id), now);
  await Promise.all(projects.map((p) => chainOn(env, syncing.store, { id: p.id, hop: 1 })));
}

/** A page's run: pass over project `id` when its last pass ended more than two minutes ago. */
export async function refreshStale(env: Env, id: string, now: number, fetchFn: typeof fetch = fetch): Promise<void> {
  const syncing = await syncingFor(env, fetchFn);
  if (!syncing) {
    return;
  }
  await trackProjects(syncing, listedProjects(env));
  const pass = await passIfStale(syncing, id, now);
  logFailure(id, pass);
  if (pass.kind === 'synced') {
    await chainOn(env, syncing.store, { id, hop: 1 });
  }
}

/** A chained run: one more pass over project `id`, then the next link while files are left to read. */
export async function refreshChained(env: Env, at: { id: string; hop: number }, now: number, fetchFn: typeof fetch = fetch): Promise<void> {
  const syncing = await syncingFor(env, fetchFn);
  if (!syncing) {
    return;
  }
  const pass = await passOver(syncing, at.id, now);
  logFailure(at.id, pass);
  if (pass.kind === 'synced') {
    await chainOn(env, syncing.store, at);
  }
}
