import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeD1 } from '#site/store/test-support';
import { requestContext, resolveViewer } from './request';
import { seededStore } from './test-support';

vi.mock('@tanstack/react-start/server', () => ({
  getRequest: () => new Request('https://lingua.test/o/r', { headers: { cookie: 'lingua_session=tok' } }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveViewer', () => {
  it('signs a local run without D1 in as the stand-in login', async () => {
    const viewer = await resolveViewer({ LINGUA_DEV_LOGIN: 'dev' }, await seededStore(), null, 5);

    expect(viewer).toEqual({ id: 1, login: 'dev', name: null, avatarUrl: null });
  });

  it('ignores the stand-in once D1 is bound', async () => {
    const viewer = await resolveViewer({ LINGUA_DEV_LOGIN: 'dev', LINGUA_DB: fakeD1() }, await seededStore(), null, 5);

    expect(viewer).toBeNull();
  });
});

describe('requestContext', () => {
  it('computes a page from the Worker’s bindings and the session on the request', async () => {
    const db = fakeD1((sql) => (sql.includes('FROM sessions') ? [{ id: 42, login: 'ada', name: null, avatar_url: null }] : []));
    vi.stubGlobal('KROMA_WORKERD', { env: { LINGUA_DB: db } });

    const context = await requestContext();

    expect(context.env.LINGUA_DB).toBe(db);
    expect(context.viewer).toEqual({ id: 42, login: 'ada', name: null, avatarUrl: null });
  });
});
