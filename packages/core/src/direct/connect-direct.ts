import type { KromaClient } from '@kromatv/client';
import { type DirectOffer, DirectProof } from '@kromatv/client/server';
import { probeHealth } from '../health-probe';
import { isLanBase, isLanRoute } from './lan-base';

const DEFAULT_TIMEOUT_MS = 1500;
const MAX_PROOF_BYTES = 1024;

/** How one attempt at a direct route ended. `unknown` is an offer that could
 * not be asked: the route in use, if any, is left as it was. */
export type DirectOutcome =
  | { kind: 'direct'; route: string }
  | { kind: 'canonical'; reason: 'no-route' | 'unreachable' | 'unproven' }
  | { kind: 'unknown' };

export interface ConnectDirectOptions {
  fetch: typeof globalThis.fetch;
  timeoutMs?: number;
  offer?: DirectOffer;
  routesFrom?: DirectOffer;
}

/** The offer, asked on the configured base, or null when it cannot be had. */
export async function askDirectOffer(client: KromaClient): Promise<DirectOffer | null> {
  try {
    return await client.server.direct();
  } catch {
    return null;
  }
}

/** The routes of an offer worth probing: private `http` addresses, never the
 * base the client already uses. */
export function lanRoutes(offer: DirectOffer, client: KromaClient): string[] {
  return offer.routes.filter((route) => isLanRoute(route) && route !== client.route.canonical);
}

/**
 * One attempt at a direct route to the server `client` is configured for: ask
 * the offer on the configured base, race `/api/health` on every route for the
 * same `instanceId` (each given `timeoutMs`, default 1.5 s), then require the
 * route that answered first to return the offer's answer to its challenge. The
 * probes go through `fetch` and carry no credential. Only a route that answers
 * is taken; any other outcome drops the direct route in use, except an offer
 * that could not be asked at all. A client already configured with a base on
 * its own network is left alone.
 *
 * `offer` is one just asked for, used as it is. `routesFrom` is an older one
 * whose routes are probed at once while a fresh challenge is asked for, which
 * keeps a browser's permission prompt inside the gesture that asked for it.
 */
export async function connectDirect(
  client: KromaClient,
  options: ConnectDirectOptions,
): Promise<DirectOutcome> {
  if (isLanBase(client.route.canonical)) return { kind: 'canonical', reason: 'no-route' };
  const challenge = options.offer ? Promise.resolve(options.offer) : askDirectOffer(client);
  const known = options.routesFrom ?? (await challenge);
  if (!known) return { kind: 'unknown' };
  const routes = lanRoutes(known, client);
  if (routes.length === 0) return settle(client, { kind: 'canonical', reason: 'no-route' });
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const route = await firstToAnswer(routes, known.instanceId, options.fetch, timeoutMs);
  if (!route) return settle(client, { kind: 'canonical', reason: 'unreachable' });
  const offer = await challenge;
  if (!offer) return { kind: 'unknown' };
  const proven =
    offer.instanceId === known.instanceId &&
    (await answers(route, offer, options.fetch, timeoutMs));
  return settle(
    client,
    proven ? { kind: 'direct', route } : { kind: 'canonical', reason: 'unproven' },
  );
}

function settle(client: KromaClient, outcome: DirectOutcome): DirectOutcome {
  if (outcome.kind === 'direct') client.route.useDirect(outcome.route);
  else client.route.drop();
  return outcome;
}

function firstToAnswer(
  routes: readonly string[],
  instanceId: string,
  fetchFn: typeof globalThis.fetch,
  timeoutMs: number,
): Promise<string | null> {
  return new Promise((resolve) => {
    let left = routes.length;
    for (const route of routes) {
      void probeHealth(fetchFn, route, timeoutMs).then((health) => {
        left -= 1;
        if (health?.instanceId === instanceId) resolve(route);
        else if (left === 0) resolve(null);
      });
    }
  });
}

async function answers(
  route: string,
  offer: DirectOffer,
  fetchFn: typeof globalThis.fetch,
  timeoutMs: number,
): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const url = `${route}/api/server/direct/proof?nonce=${encodeURIComponent(offer.nonce)}`;
    const res = await fetchFn(url, { signal: ctrl.signal });
    if (!res.ok) return false;
    const text = await res.text();
    if (text.length > MAX_PROOF_BYTES) return false;
    const proof = DirectProof.safeParse(JSON.parse(text));
    return proof.success && proof.data.answer === offer.answer;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
