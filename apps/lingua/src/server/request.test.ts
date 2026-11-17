import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeD1 } from '#site/store/test-support';
import { requestContext, resolveViewer } from './request';
import { seededStore } from './test-support';

vi.mock('@tanstack/react-start/server', () => ({
  getRequest: () =>
    new Request('https://lingua.test/o/r', { headers: { cookie: '__Host-lingua_session=tok' } }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ASKED = { cookies: null, now: 5 };

describe('resolveViewer', () => {
  it('signs a local run without D1 in as the stand-in login', async () => {
    const viewer = await resolveViewer({ LINGUA_DEV_LOGIN: 'dev' }, await seededStore(), ASKED);

    expect(viewer).toEqual({ id: 1, login: 'dev', name: null, avatarUrl: null });
  });

  it('ignores the stand-in once D1 is bound', async () => {
    const viewer = await resolveViewer(
      { LINGUA_DEV_LOGIN: 'dev', LINGUA_DB: fakeD1() },
      await seededStore(),
      ASKED,
    );

    expect(viewer).toBeNull();
  });
});

describe('requestContext', () => {
  it('computes a page from the Worker’s bindings and the session on the request', async () => {
    const db = fakeD1((sql) =>
      sql.includes('FROM sessions') ? [{ id: 42, login: 'ada', name: null, avatar_url: null }] : [],
    );
    vi.stubGlobal('KROMA_WORKERD', { env: { LINGUA_DB: db } });

    const context = await requestContext();

    expect(context.env.LINGUA_DB).toBe(db);
    expect(context.viewer).toEqual({ id: 42, login: 'ada', name: null, avatarUrl: null });
  });
});

async function requestIn(workerd: object) {
  vi.resetModules();
  vi.stubGlobal('KROMA_WORKERD', workerd);
  return import('./request');
}

describe('refreshAfterServing', () => {
  it('hands the project’s pass to the Worker to finish once the page is served', async () => {
    const held: Promise<unknown>[] = [];
    const { refreshAfterServing } = await requestIn({
      env: { LINGUA_DB: fakeD1() },
      waitUntil: (p: Promise<unknown>) => held.push(p),
    });

    await refreshAfterServing('o/r');

    expect(held).toHaveLength(1);
    await expect(held[0]).resolves.toBeUndefined();
  });

  it('logs a pass that could not run', async () => {
    const held: Promise<unknown>[] = [];
    const failing = fakeD1(() => {
      throw new Error('D1 is down');
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { refreshAfterServing } = await requestIn({
      env: { LINGUA_DB: failing },
      waitUntil: (p: Promise<unknown>) => held.push(p),
    });

    await refreshAfterServing('o/r');
    await Promise.all(held);

    expect(logged).toHaveBeenCalledWith('lingua: o/r did not refresh', expect.any(Error));
  });
});
