import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { workerContext } from './worker-env';

const PROBE = 'KROMA_SITE_KIT_PROBE';

process.env[PROBE] = 'ambient';

afterAll(() => {
  delete process.env[PROBE];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function reloaded() {
  vi.resetModules();
  return (await import('./worker-env')).workerContext;
}

describe('workerContext', () => {
  it('stands in the ambient process environment when there is no workerd', async () => {
    const { env } = await workerContext();
    expect(env[PROBE]).toBe('ambient');
  });

  it('hands back one env object, so a cache keyed on its identity can hit', async () => {
    const first = await workerContext();
    const second = await workerContext();
    expect(second.env).toBe(first.env);
  });

  it('reads the environment once, so a later binding change does not leak in', async () => {
    process.env[`${PROBE}_LATE`] = 'late';
    const { env } = await workerContext();
    delete process.env[`${PROBE}_LATE`];
    expect(env[`${PROBE}_LATE`]).toBeUndefined();
  });

  it('swallows a background failure rather than leaving it unhandled', async () => {
    const { waitUntil } = await workerContext();
    const seen: unknown[] = [];
    const onUnhandled = (err: unknown) => {
      seen.push(err);
    };
    process.on('unhandledRejection', onUnhandled);

    waitUntil(Promise.reject(new Error('cache put failed')));
    await new Promise((resolve) => setTimeout(resolve, 10));

    process.off('unhandledRejection', onUnhandled);
    expect(seen).toEqual([]);
  });

  it('leaves out a binding the ambient environment reports as undefined', async () => {
    const fresh = await reloaded();
    vi.stubGlobal('process', { env: { GITHUB_REPO: 'someone/fork', GITHUB_TOKEN: undefined } });
    const { env } = await fresh();
    expect(env).toEqual({ GITHUB_REPO: 'someone/fork' });
    expect('GITHUB_TOKEN' in env).toBe(false);
  });

  it('stands in an empty environment when the host exposes none', async () => {
    const fresh = await reloaded();
    vi.stubGlobal('process', {});
    const { env, waitUntil } = await fresh();
    expect(env).toEqual({});
    expect(typeof waitUntil).toBe('function');
  });

  it('hands back the bindings workerd itself carries, not the process environment', async () => {
    const fresh = await reloaded();
    const bindings = { GITHUB_REPO: 'someone/fork' };
    vi.stubGlobal('KROMA_WORKERD', { env: bindings, waitUntil: () => undefined });
    const { env } = await fresh();
    expect(env).toBe(bindings);
    expect(env[PROBE]).toBeUndefined();
  });

  it("wires workerd's waitUntil, so a background put outlives the response", async () => {
    const fresh = await reloaded();
    const held: Promise<unknown>[] = [];
    vi.stubGlobal('KROMA_WORKERD', {
      env: {},
      waitUntil: (p: Promise<unknown>) => held.push(p),
    });
    const { waitUntil } = await fresh();

    const put = Promise.resolve('cached');
    waitUntil(put);
    expect(held).toEqual([put]);
  });

  it('swallows the background work workerd offers nowhere to hand it to', async () => {
    const fresh = await reloaded();
    vi.stubGlobal('KROMA_WORKERD', {});
    const { env, waitUntil } = await fresh();
    const seen: unknown[] = [];
    const onUnhandled = (err: unknown) => {
      seen.push(err);
    };
    process.on('unhandledRejection', onUnhandled);

    waitUntil(Promise.reject(new Error('cache put failed')));
    await new Promise((resolve) => setTimeout(resolve, 10));

    process.off('unhandledRejection', onUnhandled);
    expect(env).toEqual({});
    expect(seen).toEqual([]);
  });
});
