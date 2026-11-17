import { z } from 'zod';
import { ProjectId } from '#site/core/config';
import type { Store } from '#site/store/store';
import type { Env } from './env';

/** The header a chained pass carries, so only this Worker can ask for one. */
export const CHAIN_HEADER = 'x-lingua-chain';

/** How many passes one chain may run before it stops and leaves the rest to the cron. */
export const MAX_HOPS = 50;

/** `POST /internal/sync`: the repository to go on reading, and how many passes the chain already ran. */
export const ChainInput = z.object({ project: ProjectId, hop: z.int().min(1).max(MAX_HOPS) });
export type ChainInput = z.infer<typeof ChainInput>;

const encoder = new TextEncoder();
const HEX_MAC = /^[0-9a-f]{64}$/;

const signedFor = (project: string) => encoder.encode(`chain:${project}`);

async function chainKey(env: Env): Promise<CryptoKey | null> {
  const secret = env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!secret) {
    return null;
  }
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function macOf(proof: string | null): Uint8Array<ArrayBuffer> | null {
  if (proof === null || !HEX_MAC.test(proof)) {
    return null;
  }
  return Uint8Array.from(proof.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
}

/** The proof a chained call carries: an HMAC of the project under the OAuth secret, or null without one. */
export async function chainProof(env: Env, project: string): Promise<string | null> {
  const key = await chainKey(env);
  if (!key) {
    return null;
  }
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, signedFor(project)));
  return [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Whether `proof` is what this deployment would have signed for `project`. The comparison is the platform's, in constant time. */
export async function chainProven(env: Env, project: string, proof: string | null): Promise<boolean> {
  const key = await chainKey(env);
  const mac = macOf(proof);
  if (!key || !mac) {
    return false;
  }
  return crypto.subtle.verify('HMAC', key, mac, signedFor(project));
}

/** Whether project `id` has files of a newer head left to read, with nothing stopping it. */
export async function stillReading(store: Store, id: string): Promise<boolean> {
  const project = await store.project(id);
  return project !== null && project.syncError === null && project.branchSha !== null && project.branchSha !== project.headSha;
}

/**
 * Hand the rest of a sync to a fresh invocation of this Worker, which has a
 * fresh budget of GitHub requests, when project `id` still has files to read.
 * Does nothing past {@link MAX_HOPS} or without the `SELF` binding.
 */
export async function chainOn(env: Env, store: Store, at: { id: string; hop: number }): Promise<void> {
  const proof = await chainProof(env, at.id);
  if (!env.SELF || proof === null || at.hop >= MAX_HOPS || !(await stillReading(store, at.id))) {
    return;
  }
  await env.SELF.fetch('https://lingua.internal/internal/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', [CHAIN_HEADER]: proof },
    body: JSON.stringify({ project: at.id, hop: at.hop + 1 }),
  });
}
