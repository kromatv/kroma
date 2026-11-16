import { createHmac } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { gitHubFetch, sha, testApp } from '#site/github/test-support';
import { MemoryStore } from '#site/store/memory-store';
import type { Store } from '#site/store/store';
import { api } from './api';
import { readOwners } from './app-owners';
import { type PendingSend, pendingCookie, readPending } from './authorizations';
import type { Env } from './env';
import { openSession } from './session';
import { ada, gitHubListing, membership, seededStore } from './test-support';

const H = vi.hoisted(() => ({ store: null as Store | null }));

vi.mock('./env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./env')>()),
  storeFor: async () => H.store,
}));

const ORIGIN = 'https://lingua.test';
const OAUTH: Env = { GITHUB_OAUTH_CLIENT_ID: 'cid', GITHUB_OAUTH_CLIENT_SECRET: 'csecret' };

let env: Env;

beforeAll(() => {
  const app = testApp();
  env = { ...OAUTH, GITHUB_APP_ID: app.appId, GITHUB_APP_PRIVATE_KEY: app.privateKey, GITHUB_WEBHOOK_SECRET: app.webhookSecret };
}, 60_000);

beforeEach(async () => {
  H.store = await seededStore();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const later = { waitUntil: () => undefined };

const get = (path: string, init: RequestInit = {}, on: Env = env) => api(new Request(`${ORIGIN}${path}`, init), on, later);

async function signedIn(): Promise<string> {
  const set = await openSession(H.store ?? new MemoryStore(), ada, Math.floor(Date.now() / 1000));
  return set.split(';')[0] ?? '';
}

async function send(method: string, path: string, body: unknown, on: Env = env): Promise<Response | null> {
  const headers = { origin: ORIGIN, cookie: await signedIn(), 'content-type': 'application/json' };
  return get(path, { method, headers, body: typeof body === 'string' ? body : JSON.stringify(body) }, on);
}

const cookiesOf = (response: Response | null) => response?.headers.getSetCookie() ?? [];

describe('api', () => {
  it('leaves a path it does not route to the pages', async () => {
    expect(await get('/o/r')).toBeNull();
  });

  it('reports which of its two GitHub apps the deployment holds', async () => {
    const response = await get('/health', {}, OAUTH);

    expect(await response?.json()).toEqual({ ok: true, github: false, signIn: true });
  });

  it('lands a message link on the page of the file that holds it', async () => {
    const response = await get('/go/o/r/fr/p.play');

    expect(response?.headers.get('location')).toBe('/o/r/fr/p#p.play');
  });
});

describe('setup', () => {
  it('leaves the setup page to the router, connected or not', async () => {
    const pages = await Promise.all([get('/setup', {}, {}), get('/setup')]);

    expect(pages).toEqual([null, null]);
  });

  it('explains a return from GitHub without a usable code', async () => {
    const responses = await Promise.all(['/setup/done?code=<x>', '/setup/done'].map((path) => get(path, {}, {})));

    expect(responses.map((response) => response?.headers.get('location'))).toEqual([
      '/problem?reason=setup-code-missing',
      '/problem?reason=setup-code-missing',
    ]);
  });

  it('holds the code GitHub returns from the manifest and sends the browser to the setup page', async () => {
    const store = new MemoryStore();
    H.store = store;

    const response = await get('/setup/done?code=abcdef12', {}, {});

    expect(response?.status).toBe(303);
    expect(response?.headers.get('location')).toBe('/setup?created=1&code=abcdef12');
    expect(store.setupCodes).toEqual(['abcdef12']);
  });

  it('quotes a code the router would read as a number', async () => {
    const response = await get('/setup/done?code=12345678', {}, {});

    expect(response?.headers.get('location')).toBe('/setup?created=1&code=%2212345678%22');
  });

  it('explains a return from GitHub once the App is connected', async () => {
    const response = await get('/setup/done?code=abcdef12');

    expect(response?.headers.get('location')).toBe('/problem?reason=already-connected');
  });
});

describe('editing', () => {
  it('saves an edit from a signed-in contributor', async () => {
    const response = await send('PUT', '/api/edits', { project: 'o/r', locale: 'fr', file: 'p', key: 'p.play', value: 'Voir {title}' });

    expect(await response?.json()).toEqual({ draft: 'Voir {title}', issues: [] });
  });

  it('answers a refused edit with the issues that refused it', async () => {
    const response = await send('PUT', '/api/edits', { project: 'o/r', locale: 'fr', file: 'p', key: 'p.play', value: 'Voir {name}' });

    expect(response?.status).toBe(422);
    expect(await response?.json()).toMatchObject({ issues: [{ code: 'unknown-token' }, { code: 'missing-token' }] });
  });

  it('refuses a write from another site', async () => {
    const response = await get('/api/edits', { method: 'PUT', headers: { origin: 'https://evil.test', cookie: await signedIn() } });

    expect(response?.status).toBe(403);
  });

  it('takes a same-origin write a browser sent without an Origin header', async () => {
    const headers = { 'sec-fetch-site': 'same-origin', cookie: await signedIn() };

    const response = await get('/api/edits', { method: 'PUT', headers, body: '{}' });

    expect(response?.status).toBe(400);
  });

  it('asks a visitor who is not signed in to sign in', async () => {
    const paths = ['/api/confirm', '/api/locales', '/api/proposals'];

    const responses = await Promise.all(paths.map((path) => get(path, { method: 'POST', headers: { origin: ORIGIN } })));

    expect(responses.map((r) => r?.status)).toEqual([401, 401, 401]);
  });

  it('refuses an edit of a message the source does not have, with no issues to show', async () => {
    const response = await send('PUT', '/api/edits', { project: 'o/r', locale: 'fr', file: 'p', key: 'p.nope', value: 'x' });

    expect(response?.status).toBe(404);
    expect(await response?.json()).toMatchObject({ issues: [] });
  });

  it('refuses a body whose declared length is past its size bound, unread', async () => {
    const headers = { origin: ORIGIN, cookie: await signedIn(), 'content-length': '70000' };

    const body = JSON.stringify({ project: 'o/r', locale: 'fr', file: 'p', key: 'p.play', value: 'Voir {title}' });

    const response = await get('/api/edits', { method: 'PUT', headers, body });

    expect(response?.status).toBe(400);
  });

  it('refuses a body that is not JSON, or past its size bound', async () => {
    const [garbled, huge] = await Promise.all([
      send('PUT', '/api/edits', '{'),
      send('PUT', '/api/edits', { project: 'o/r', locale: 'fr', file: 'p', key: 'p.play', value: 'x'.repeat(70_000) }),
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

  it('refuses each write whose body does not parse', async () => {
    const statuses = await Promise.all(['/api/confirm', '/api/locales', '/api/proposals'].map(async (path) => (await send('POST', path, {}))?.status));

    expect(statuses).toEqual([400, 400, 400]);
  });
});

const pending: PendingSend = { state: 's', project: 'o/r', locale: 'fr', to: '/o/r/fr' };

const gitHubSigningIn = (token: unknown) =>
  gitHubFetch({
    routes: {
      'POST /login/oauth/access_token': () => token,
      'GET /user': () => ({ id: 42, login: 'ada' }),
    },
  });

const stateOf = (response: Response | null) =>
  new URL(response?.headers.get('location') ?? '').searchParams.get('state') ?? '';

describe('signing in', () => {
  it('explains that it cannot start before the OAuth App is set', async () => {
    const response = await get('/auth/login', {}, {});

    expect(response?.headers.get('location')).toBe('/problem?reason=sign-in-unavailable');
  });

  it('sends the browser to GitHub with a state whose secret only this browser holds', async () => {
    const response = await get('/auth/login?to=/o/r/fr');

    const [token, to] = stateOf(response).split('.');
    expect(response?.headers.get('location')).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize\?/);
    expect(to).toBe('/o/r/fr');
    expect(cookiesOf(response)[0]).toMatch(new RegExp(`^lingua_oauth=${token};`));
  });

  it('never returns a sign-in to another site', async () => {
    const response = await get('/auth/login?to=//evil.test');

    expect(stateOf(response)).toMatch(/^[\w-]+\.\/$/);
  });

  it('opens a session for the account GitHub confirms and returns to the page it left', async () => {
    vi.stubGlobal('fetch', gitHubSigningIn({ access_token: 'gho_x' }));

    const response = await get('/auth/callback?code=c&state=tok./o/r/v1.2', {
      headers: { cookie: 'lingua_oauth=tok' },
    });

    expect(response?.headers.get('location')).toBe('/o/r/v1.2');
    expect(cookiesOf(response).map((c) => c.split('=')[0])).toEqual(['lingua_oauth', 'lingua_session']);
  });

  it('explains a callback whose state this browser did not ask for, or that carries none', async () => {
    const [other, none] = await Promise.all([
      get('/auth/callback?code=c&state=tok./', { headers: { cookie: 'lingua_oauth=other' } }),
      get('/auth/callback?code=c', { headers: { cookie: 'lingua_oauth=tok' } }),
    ]);

    expect([other, none].map((response) => response?.headers.get('location'))).toEqual([
      '/problem?reason=sign-in-expired',
      '/problem?reason=sign-in-expired',
    ]);
  });

  it('explains a sign-in GitHub does not confirm, or sends back without a code', async () => {
    vi.stubGlobal('fetch', gitHubSigningIn({ error: 'bad_verification_code' }));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const headers = { cookie: 'lingua_oauth=tok' };

    const [refused, cancelled] = await Promise.all([
      get('/auth/callback?code=c&state=tok./', { headers }),
      get('/auth/callback?error=access_denied&state=tok./', { headers }),
    ]);

    expect([refused, cancelled].map((response) => response?.headers.get('location'))).toEqual([
      '/problem?reason=sign-in-refused',
      '/problem?reason=sign-in-refused',
    ]);
  });

  it('signs out, after which the session opens nothing', async () => {
    const cookie = await signedIn();

    const out = await get('/auth/logout', { method: 'POST', headers: { origin: ORIGIN, cookie } });
    const after = await get('/api/confirm', { method: 'POST', headers: { origin: ORIGIN, cookie } });

    expect([out?.status, out?.headers.get('location'), after?.status]).toEqual([303, '/', 401]);
  });

  it('refuses a sign-out from another site', async () => {
    const response = await get('/auth/logout', { method: 'POST', headers: { origin: 'https://evil.test' } });

    expect(response?.status).toBe(403);
  });
});

describe('choosing where to create the App', () => {
  it('asks GitHub to read the organisations, under a state marked for it', async () => {
    const response = await get('/auth/setup', {}, OAUTH);

    const asked = new URL(response?.headers.get('location') ?? '');
    expect(asked.searchParams.get('scope')).toBe('read:org');
    expect(stateOf(response)).toMatch(/^[\w-]+\.owners$/);
  });

  it('hands the setup page the accounts the App may be created under', async () => {
    vi.stubGlobal('fetch', gitHubListing([membership('kromatv', 'admin')]));

    const response = await get('/auth/callback?code=c&state=tok.owners', { headers: { cookie: 'lingua_oauth=tok' } }, OAUTH);

    const held = cookiesOf(response).find((line) => line.startsWith('lingua_owners=')) ?? '';
    const owners = await readOwners(held.split(';')[0], 'csecret');
    expect(response?.status).toBe(303);
    expect(response?.headers.get('location')).toBe('/setup');
    expect(owners.map((owner) => owner.login)).toEqual(['ada', 'kromatv']);
  });

  it('sends the operator back to setup when GitHub would not list them', async () => {
    const headers = { cookie: 'lingua_oauth=tok' };

    const response = await get('/auth/callback?error=access_denied&state=tok.owners', { headers }, OAUTH);

    expect(response?.headers.get('location')).toBe('/problem?reason=owners-unlisted');
  });
});

describe('sending', () => {
  it('asks the contributor’s GitHub for public_repo before sending from their fork', async () => {
    const response = await send('POST', '/api/proposals', { project: 'o/r', locale: 'fr', to: '/o/r/fr' });

    const { url } = await response?.json();
    expect(new URL(url).searchParams.get('scope')).toBe('public_repo');
    expect(new URL(url).searchParams.get('login')).toBe('ada');
    expect(cookiesOf(response)[0]).toMatch(/^lingua_send=/);
  });

  it('cannot send before the deployment holds both of its GitHub apps', async () => {
    const withoutApp = await send('POST', '/api/proposals', { project: 'o/r', locale: 'fr' }, OAUTH);
    const withoutOAuth = await send('POST', '/api/proposals', { project: 'o/r', locale: 'fr' }, { ...env, GITHUB_OAUTH_CLIENT_ID: undefined });

    expect([withoutApp?.status, withoutOAuth?.status]).toEqual([503, 503]);
  });

  it('refuses to send a project Lingua does not translate', async () => {
    const response = await send('POST', '/api/proposals', { project: 'x/y', locale: 'fr', via: 'lingua' });

    expect(response?.status).toBe(404);
    expect(await response?.json()).toEqual({ error: 'Lingua does not translate this project' });
  });

  it('brings GitHub’s answer back to the page the send left, forgetting the send', async () => {
    const headers = { cookie: pendingCookie(pending).split(';')[0] ?? '' };

    const response = await get('/auth/callback?state=s&error=access_denied', { headers });

    expect(response?.headers.get('location')).toBe('/o/r/fr?send=declined');
    expect(cookiesOf(response)[0]).toMatch(/^lingua_send=;/);
  });

  it('sends as the contributor once GitHub grants public_repo, saying when GitHub refused', async () => {
    const headers = { cookie: `${pendingCookie(pending).split(';')[0]}; ${await signedIn()}` };
    vi.stubGlobal('fetch', gitHubFetch({
      routes: {
        'POST /login/oauth/access_token': () => ({ access_token: 'gho_x', scope: 'public_repo' }),
        'GET /user': () => ({ id: 42, login: 'ada' }),
        'POST /app/installations/1/access_tokens': () => ({ token: 'ghs_x', expires_at: new Date(Date.now() + 3_600_000).toISOString() }),
      },
    }));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await get('/auth/callback?state=s&code=c', { headers });

    expect(response?.headers.get('location')).toBe('/o/r/fr?send=failed');
  });

  it('answers a send through Lingua’s App with what it came to', async () => {
    await H.store?.setSynced('o/r', { headSha: sha('a'), treeSha: sha('0e'), config: JSON.stringify({ projects: [{ path: 'loc' }] }), configError: null, at: 1 });
    vi.stubGlobal('fetch', gitHubFetch({
      routes: {
        'POST /app/installations/1/access_tokens': () => ({ token: 'ghs_x', expires_at: new Date(Date.now() + 3_600_000).toISOString() }),
        'GET /repos/o/r/branches/main': () => ({ commit: { sha: sha('a'), commit: { tree: { sha: sha('0e') } } } }),
      },
    }));

    const response = await send('POST', '/api/proposals', { project: 'o/r', locale: 'fr', via: 'lingua' });

    expect(await response?.json()).toEqual({ kind: 'nothing' });
  });

  it('comes back to the language’s own page when a send names none', async () => {
    const response = await send('POST', '/api/proposals', { project: 'o/r', locale: 'fr' });

    const header = cookiesOf(response)[0]?.split(';')[0];
    expect(readPending(header)?.to).toBe('/o/r/fr');
  });

  it('brings a send back as failed once the deployment lost its GitHub App', async () => {
    const headers = { cookie: pendingCookie(pending).split(';')[0] ?? '' };

    const response = await get('/auth/callback?state=s&code=c', { headers }, OAUTH);

    expect(response?.headers.get('location')).toBe('/o/r/fr?send=failed');
  });
});

const signatureOf = (body: string, secret = 'whsec') => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

function delivery(event: string, payload: unknown, secret?: string): RequestInit {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return { method: 'POST', headers: { 'x-github-event': event, 'x-hub-signature-256': signatureOf(body, secret) }, body };
}

async function deliver(init: RequestInit): Promise<Response | null> {
  const held: Promise<unknown>[] = [];
  const response = await api(new Request(`${ORIGIN}/webhook`, init), env, { waitUntil: (p) => held.push(p) });
  await Promise.all(held);
  return response;
}

describe('the webhook', () => {
  it('acts on a signed delivery after answering it', async () => {
    const response = await deliver(delivery('installation', { action: 'deleted', installation: { id: 1 } }));

    expect(response?.status).toBe(202);
    expect(await H.store?.projects()).toEqual([]);
  });

  it('logs a delivery it could not act on', async () => {
    vi.stubGlobal('fetch', gitHubFetch({ routes: {} }));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await deliver(delivery('installation', { action: 'created', installation: { id: 404 } }));

    expect(logged).toHaveBeenCalledWith('lingua: webhook failed', expect.any(Error));
  });

  it('refuses a delivery GitHub did not sign, or one that is not JSON', async () => {
    const [forged, unsigned, garbled] = await Promise.all([
      deliver(delivery('push', {}, 'guess')),
      deliver({ method: 'POST', body: '{}' }),
      deliver(delivery('push', '{')),
    ]);

    expect([forged?.status, unsigned?.status, garbled?.status]).toEqual([401, 401, 400]);
  });

  it('accepts a signed delivery that names no event, and does nothing with it', async () => {
    const response = await deliver({ method: 'POST', body: '{}', headers: { 'x-hub-signature-256': signatureOf('{}') } });

    expect(response?.status).toBe(202);
    expect(await H.store?.project('o/r')).not.toBeNull();
  });

  it('refuses a delivery past four megabytes', async () => {
    const response = await deliver(delivery('push', 'x'.repeat(4 * 1024 * 1024 + 1)));

    expect(response?.status).toBe(413);
  });

  it('refuses every delivery until the App is connected', async () => {
    const response = await api(new Request(`${ORIGIN}/webhook`, delivery('push', {})), OAUTH, later);

    expect(response?.status).toBe(503);
  });
});
