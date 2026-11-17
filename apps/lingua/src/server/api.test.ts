import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStore } from '#site/store/memory-store';
import type { Store } from '#site/store/store';
import { asking, get, ORIGIN } from './api-test-support';
import { seededStore } from './test-support';

const H = vi.hoisted((): { store: Store | null } => ({ store: null }));

vi.mock('./env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./env')>()),
  storeFor: async () => H.store,
}));

beforeEach(async () => {
  H.store = await seededStore();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const { send, signedIn } = asking(() => H.store ?? new MemoryStore());

describe('api', () => {
  it('leaves a path it does not route to the pages', async () => {
    expect(await get('/o/r')).toBeNull();
  });

  it('reports whether people can sign in, and how many repositories it lists', async () => {
    const response = await get('/health');

    expect(await response?.json()).toEqual({ ok: true, signIn: true, projects: 1 });
  });

  it('lands a message link on the page of the file that holds it', async () => {
    const response = await get('/go/o/r/fr/p.play');

    expect(response?.headers.get('location')).toBe('/o/r/fr/p#p.play');
  });
});

describe('setup', () => {
  it('leaves the setup page to the router, set up or not', async () => {
    const pages = await Promise.all([get('/setup', {}, {}), get('/setup')]);

    expect(pages).toEqual([null, null]);
  });

  it('routes nothing a GitHub App would call', async () => {
    const answers = await Promise.all([
      get('/setup/done?code=abcdef12'),
      get('/webhook', { method: 'POST', body: '{}' }),
    ]);

    expect(answers).toEqual([null, null]);
  });
});

describe('editing', () => {
  it('saves an edit from a signed-in contributor', async () => {
    const response = await send('PUT', '/api/edits', {
      project: 'o/r',
      locale: 'fr',
      file: 'p',
      key: 'p.play',
      value: 'Voir {title}',
    });

    expect(await response?.json()).toEqual({ draft: 'Voir {title}', issues: [] });
  });

  it('answers a refused edit with the issues that refused it', async () => {
    const response = await send('PUT', '/api/edits', {
      project: 'o/r',
      locale: 'fr',
      file: 'p',
      key: 'p.play',
      value: 'Voir {name}',
    });

    expect(response?.status).toBe(422);
    expect(await response?.json()).toMatchObject({
      issues: [{ code: 'unknown-token' }, { code: 'missing-token' }],
    });
  });

  it('refuses a write from another site', async () => {
    const response = await get('/api/edits', {
      method: 'PUT',
      headers: { origin: 'https://evil.test', cookie: await signedIn() },
    });

    expect(response?.status).toBe(403);
  });

  it('takes a same-origin write a browser sent without an Origin header', async () => {
    const headers = { 'sec-fetch-site': 'same-origin', cookie: await signedIn() };

    const response = await get('/api/edits', { method: 'PUT', headers, body: '{}' });

    expect(response?.status).toBe(400);
  });

  it('asks a visitor who is not signed in to sign in', async () => {
    const paths = ['/api/confirm', '/api/discard', '/api/locales', '/api/proposals'];

    const responses = await Promise.all(
      paths.map((path) => get(path, { method: 'POST', headers: { origin: ORIGIN } })),
    );

    expect(responses.map((r) => r?.status)).toEqual([401, 401, 401, 401]);
  });

  it('refuses an edit of a message the source does not have, with no issues to show', async () => {
    const response = await send('PUT', '/api/edits', {
      project: 'o/r',
      locale: 'fr',
      file: 'p',
      key: 'p.nope',
      value: 'x',
    });

    expect(response?.status).toBe(404);
    expect(await response?.json()).toMatchObject({ issues: [] });
  });

  it('refuses a body whose declared length is past its size bound, unread', async () => {
    const headers = { origin: ORIGIN, cookie: await signedIn(), 'content-length': '70000' };

    const body = JSON.stringify({
      project: 'o/r',
      locale: 'fr',
      file: 'p',
      key: 'p.play',
      value: 'Voir {title}',
    });

    const response = await get('/api/edits', { method: 'PUT', headers, body });

    expect(response?.status).toBe(400);
  });

  it('refuses a body that is not JSON, or past its size bound', async () => {
    const [garbled, huge] = await Promise.all([
      send('PUT', '/api/edits', '{'),
      send('PUT', '/api/edits', {
        project: 'o/r',
        locale: 'fr',
        file: 'p',
        key: 'p.play',
        value: 'x'.repeat(70_000),
      }),
    ]);

    expect([garbled?.status, huge?.status]).toEqual([400, 400]);
  });

  it('confirms a translation, and refuses a key that is no message', async () => {
    const [kept, refused] = await Promise.all([
      send('POST', '/api/confirm', { project: 'o/r', locale: 'fr', keys: ['p.play'] }),
      send('POST', '/api/confirm', { project: 'o/r', locale: 'fr', keys: ['p.nope'] }),
    ]);

    expect(await kept?.json()).toEqual({ confirmed: ['p.play'] });
    expect(refused?.status).toBe(404);
  });

  it('starts a language, and refuses one the project offers already', async () => {
    const [started, listed] = await Promise.all([
      send('POST', '/api/locales', { project: 'o/r', locale: 'de' }),
      send('POST', '/api/locales', { project: 'o/r', locale: 'pl' }),
    ]);

    expect(await started?.json()).toEqual({ locale: 'de', name: 'Deutsch' });
    expect(listed?.status).toBe(409);
  });

  it('discards a language the contributor started, and refuses one the project does not offer', async () => {
    await send('POST', '/api/locales', { project: 'o/r', locale: 'de' });

    const [started, unknown] = await Promise.all([
      send('POST', '/api/discard', { project: 'o/r', locale: 'de' }),
      send('POST', '/api/discard', { project: 'o/r', locale: 'it' }),
    ]);

    expect(await started?.json()).toEqual({ discarded: 1, removed: true });
    expect(unknown?.status).toBe(404);
  });

  it('refuses each write whose body does not parse', async () => {
    const paths = ['/api/confirm', '/api/discard', '/api/locales', '/api/proposals'];

    const statuses = await Promise.all(
      paths.map(async (path) => (await send('POST', path, {}))?.status),
    );

    expect(statuses).toEqual([400, 400, 400, 400]);
  });
});
