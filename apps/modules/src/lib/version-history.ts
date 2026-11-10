import {
  HISTORY_SCHEMA,
  type HistoryVersions,
  type KnownVersions,
  RegistryVersion,
} from '@kromatv/registry';
import { z } from 'zod';
import { DEFAULT_REPO, type Env, edgeCache, githubHeaders, jsonResponse } from '#site/lib/source';

const CACHE_FRESH = 'https://kroma-modules.cache/history-fresh';
const CACHE_STALE = 'https://kroma-modules.cache/history-stale';
const FRESH_TTL = 300;
const STALE_TTL = 604_800;

const Envelope = z.object({
  schema: z.literal(HISTORY_SCHEMA),
  modules: z.record(z.string(), z.unknown()),
});
const Versions = z.record(z.string(), RegistryVersion);

async function fetchUpstream(env: Env | undefined): Promise<string> {
  const repo = env?.GITHUB_REPO || DEFAULT_REPO;
  const res = await fetch(`https://github.com/${repo}/releases/download/modules/history.json`, {
    headers: githubHeaders(env),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`history.json ${res.status}`);
  return res.text();
}

async function load(env: Env | undefined, waitUntil: (p: Promise<unknown>) => void) {
  const cache = edgeCache();
  const hit = await cache?.match(CACHE_FRESH);
  if (hit) return hit.text();
  try {
    const body = await fetchUpstream(env);
    if (cache) {
      waitUntil(cache.put(CACHE_FRESH, jsonResponse(body, FRESH_TTL)));
      waitUntil(cache.put(CACHE_STALE, jsonResponse(body, STALE_TTL)));
    }
    return body;
  } catch (err) {
    const stale = await cache?.match(CACHE_STALE);
    if (stale) return stale.text();
    console.error('version history unavailable', err);
    return null;
  }
}

/**
 * Every version of `id` the release train's history describes, or `undefined`
 * when there is no history to read. Only the one module is validated, so a
 * request for one record does not pay for every other module's.
 */
export async function describedVersions(
  env: Env | undefined,
  waitUntil: (p: Promise<unknown>) => void,
  id: string,
): Promise<HistoryVersions | undefined> {
  const body = await load(env, waitUntil);
  if (!body) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return undefined;
  }
  const envelope = Envelope.safeParse(raw);
  if (!envelope.success) return undefined;
  const versions = Versions.safeParse(envelope.data.modules[id]);
  return versions.success ? versions.data : undefined;
}

/** The release listing's versions, each one the history describes replaced by its
 *  full record. A version only the listing knows keeps its bare artifacts. */
export function withDescriptions(
  listed: KnownVersions | undefined,
  described: HistoryVersions | undefined,
): KnownVersions | undefined {
  if (!described) return listed;
  return { ...listed, versions: { ...listed?.versions, ...described } };
}
