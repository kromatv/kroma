import { describe, expect, it, vi } from 'vitest';
import { memoryStore } from '#site/store/memory-store';
import type { Store } from '#site/store/store';
import { chainOn, chainProof, chainProven, MAX_HOPS, stillReading } from './chain';
import type { Env, SelfBinding } from './env';

const SECRET = 'oauth-secret';

function selfBinding(): SelfBinding & { fetch: ReturnType<typeof vi.fn> } {
  return { fetch: vi.fn(async () => new Response(null, { status: 202 })) };
}

async function reading(): Promise<Store> {
  const store = memoryStore();
  await store.upsertProject({ id: 'o/r', branch: 'main', pinned: true });
  await store.setBranchHead('o/r', {
    sha: 'a'.repeat(40),
    etag: null,
    progress: { done: 40, total: 110 },
  });
  return store;
}

describe('chainProof', () => {
  it('signs a project so only this deployment can ask for its next pass', async () => {
    const env: Env = { GITHUB_OAUTH_CLIENT_SECRET: SECRET };
    const proof = await chainProof(env, 'o/r');

    expect(await chainProven(env, 'o/r', proof)).toBe(true);
    expect(await chainProven(env, 'o/other', proof)).toBe(false);
    expect(await chainProven(env, 'o/r', null)).toBe(false);
    expect(await chainProven({}, 'o/r', proof)).toBe(false);
  });
});

describe('stillReading', () => {
  it('holds while a newer head has files left to read and nothing failed', async () => {
    const store = await reading();

    expect(await stillReading(store, 'o/r')).toBe(true);
    expect(await stillReading(store, 'o/missing')).toBe(false);
  });
});

describe('chainOn', () => {
  it('hands the rest of the sync to a fresh invocation, one hop further', async () => {
    const store = await reading();
    const self = selfBinding();

    await chainOn({ GITHUB_OAUTH_CLIENT_SECRET: SECRET, SELF: self }, store, { id: 'o/r', hop: 3 });

    const [url, init] = self.fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://lingua.internal/internal/sync');
    expect(JSON.parse(String(init?.body))).toEqual({ project: 'o/r', hop: 4 });
  });

  it('stops once everything is read, past the last hop, or without the binding', async () => {
    const done = memoryStore();
    await done.upsertProject({ id: 'o/r', branch: 'main', pinned: true });
    const self = selfBinding();

    await chainOn({ GITHUB_OAUTH_CLIENT_SECRET: SECRET, SELF: self }, done, { id: 'o/r', hop: 1 });
    await chainOn({ GITHUB_OAUTH_CLIENT_SECRET: SECRET, SELF: self }, await reading(), {
      id: 'o/r',
      hop: MAX_HOPS,
    });
    await chainOn({ GITHUB_OAUTH_CLIENT_SECRET: SECRET }, await reading(), { id: 'o/r', hop: 1 });

    expect(self.fetch).not.toHaveBeenCalled();
  });
});
