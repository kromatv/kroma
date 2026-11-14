import { InviteToken } from '@kromatv/client/accounts';
import { FlowId, ProviderId } from '@kromatv/client/sso';
import { recordingClient } from '@kromatv/client/test';
import { describe, expect, it } from 'vitest';
import { createAuth, type FlowBrowser, memoryFlowStore } from './auth';

const provider = ProviderId.parse('p0');

const user = {
  id: 'u1',
  email: 'lea@id.test',
  username: 'lea',
  permissions: ['playback'],
  libraries: null,
  createdAt: '2026-11-13T10:00:00Z',
  hasPin: false,
};

const STARTED = {
  flowId: 'f1',
  secret: 's3cret',
  authorizeUrl: 'https://id.test/authorize?state=x',
  expiresInSec: 600,
};

function server(finish: object) {
  return recordingClient((url) => {
    if (url.endsWith('/auth/sso/finish')) return { json: finish };
    if (url.endsWith('/auth/config')) return { json: { publicUserList: false, hasAccounts: true } };
    return { json: STARTED };
  });
}

function appBrowser(back: string | null): FlowBrowser & { opened: string[] } {
  const opened: string[] = [];
  return {
    opened,
    from: { returnTo: 'app', origin: 'https://kroma.example' },
    open: (url) => {
      opened.push(url);
      return Promise.resolve(back);
    },
  };
}

const signedIn = { status: 'signedIn', token: 't', accessToken: 'a', user };

describe('signing in through a provider from an app', () => {
  it('opens the provider, then collects with the secret it kept and the code it came back with', async () => {
    const { client, calls } = server(signedIn);
    const browser = appBrowser('kroma://sso?flow=f1&code=c0de');
    const auth = createAuth({ client, browser, store: memoryFlowStore() });

    const end = await auth.signIn.with(provider);

    expect(browser.opened).toEqual([STARTED.authorizeUrl]);
    expect(calls[0]?.body).toEqual({
      provider: 'p0',
      returnTo: 'app',
      origin: 'https://kroma.example',
    });
    expect(calls[1]?.path).toBe('/auth/sso/finish');
    expect(calls[1]?.body).toEqual({ flowId: 'f1', secret: 's3cret', code: 'c0de' });
    expect(end?.result.status).toBe('signedIn');
    expect(end?.purpose).toBe('signIn');
  });

  it('ends with nothing when the browser closes, and can still be resumed by a late return', async () => {
    const { client, calls } = server(signedIn);
    const auth = createAuth({ client, browser: appBrowser(null), store: memoryFlowStore() });

    const end = await auth.signIn.with(provider);
    const late = await auth.resume('kroma://sso?flow=f1&code=c0de');

    expect(end).toBeNull();
    expect(late?.result.status).toBe('signedIn');
    expect(calls.map((call) => call.path)).toEqual(['/auth/sso/start', '/auth/sso/finish']);
  });

  it('collects nothing for a flow it did not begin', async () => {
    const { client, calls } = server(signedIn);
    const browser = appBrowser('kroma://sso?flow=someone-elses&code=c0de');
    const auth = createAuth({ client, browser, store: memoryFlowStore() });

    const end = await auth.signIn.with(provider);

    expect(end).toBeNull();
    expect(calls.map((call) => call.path)).toEqual(['/auth/sso/start']);
  });

  it('carries the invitation the person arrived on', async () => {
    const { client, calls } = server(signedIn);
    const auth = createAuth({
      client,
      browser: appBrowser('kroma://sso?flow=f1&code=c'),
      store: memoryFlowStore(),
    });

    await auth.signIn.with(provider, { invite: InviteToken.parse('inv1') });

    expect(calls[0]?.body).toMatchObject({ provider: 'p0', invite: 'inv1' });
  });
});

describe('a flow that leaves an identity waiting', () => {
  it('keeps its keys until the identity is claimed', async () => {
    const { client, calls } = server({ status: 'emailTaken' });
    const store = memoryFlowStore();
    const auth = createAuth({
      client,
      browser: appBrowser('kroma://sso?flow=f1&code=c0de'),
      store,
    });

    const end = await auth.signIn.with(provider);
    expect(store.load('f1')).not.toBeNull();
    if (end) await auth.claim(end.keys);

    expect(end?.result.status).toBe('emailTaken');
    expect(calls.at(-1)?.path).toBe('/auth/sso/claim');
    expect(calls.at(-1)?.body).toEqual({ flowId: 'f1', secret: 's3cret', code: 'c0de' });
    expect(store.load('f1')).toBeNull();
  });

  it('forgets a flow the server no longer knows', async () => {
    const { client } = recordingClient((url) =>
      url.endsWith('/auth/sso/finish') ? { ok: false, status: 404, json: {} } : { json: STARTED },
    );
    const store = memoryFlowStore();
    const auth = createAuth({
      client,
      browser: appBrowser('kroma://sso?flow=f1&code=c0de'),
      store,
    });

    await expect(auth.signIn.with(provider)).rejects.toThrow();
    expect(store.load('f1')).toBeNull();
  });
});

describe('a page that left for the provider', () => {
  it('resumes from the two values its address carries', async () => {
    const { client, calls } = server({ status: 'linked' });
    const store = memoryFlowStore();
    store.save({
      flowId: FlowId.parse('f1'),
      secret: 's3cret',
      purpose: 'link',
      provider,
      returnTo: '/account',
    });
    const auth = createAuth({ client, browser: appBrowser(null), store });

    const end = await auth.resume({ flow: 'f1', code: 'c0de' });

    expect(calls[0]?.body).toEqual({ flowId: 'f1', secret: 's3cret', code: 'c0de' });
    expect(end).toMatchObject({ purpose: 'link', returnTo: '/account' });
    expect(store.load('f1')).toBeNull();
  });

  it('asks the server once when two callers resume the same flow together', async () => {
    const { client, calls } = server({ status: 'linked' });
    const store = memoryFlowStore();
    store.save({
      flowId: FlowId.parse('f1'),
      secret: 's3cret',
      purpose: 'link',
      provider,
      returnTo: '/',
    });
    const auth = createAuth({ client, browser: appBrowser(null), store });

    const [first, second] = await Promise.all([
      auth.resume({ flow: 'f1', code: 'c0de' }),
      auth.resume('kroma://sso?flow=f1&code=c0de'),
    ]);

    expect(calls).toHaveLength(1);
    expect(first).toEqual(second);
  });

  it('resumes nothing from an address that names no flow', async () => {
    const { client, calls } = server(signedIn);
    const auth = createAuth({ client, browser: appBrowser(null), store: memoryFlowStore() });

    expect(await auth.resume('https://kroma.example/sso')).toBeNull();
    expect(await auth.resume('https://kroma.example/sso?flow=f1')).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe('the other ways in', () => {
  it('lists what the server offers, and the two built-in methods for a server that says nothing', async () => {
    const { client } = server(signedIn);
    const auth = createAuth({ client, browser: appBrowser(null), store: memoryFlowStore() });

    expect((await auth.methods()).methods.map((method) => method.kind)).toEqual([
      'password',
      'passkey',
    ]);
  });

  it('signs in with a passkey through the prompt the shell gave', async () => {
    const { client, calls } = recordingClient((url) =>
      url.endsWith('/start')
        ? { json: { ceremonyId: 'cer1', options: { publicKey: {} } } }
        : { json: { token: 't', accessToken: 'a', user } },
    );
    const auth = createAuth({
      client,
      browser: appBrowser(null),
      store: memoryFlowStore(),
      passkey: () => Promise.resolve({ id: 'cred' }),
    });

    const result = await auth.signIn.passkey();

    expect(result.user.username).toBe('lea');
    expect(calls[1]?.body).toEqual({ ceremonyId: 'cer1', credential: { id: 'cred' } });
  });

  it('refuses a passkey sign-in in a shell that has no prompt', async () => {
    const { client } = server(signedIn);
    const auth = createAuth({ client, browser: appBrowser(null), store: memoryFlowStore() });

    await expect(auth.signIn.passkey()).rejects.toThrow('no passkey prompt');
  });
});
