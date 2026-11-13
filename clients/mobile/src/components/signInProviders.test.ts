// @vitest-environment jsdom
import { ProviderId } from '@kromatv/client/sso';
import { recordingClient } from '@kromatv/client/test';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const browser = vi.hoisted(() => ({ openAuthSessionAsync: vi.fn() }));
vi.mock('expo-web-browser', () => browser);

const made = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('#mobile/lib/device', () => ({ makeClient: () => made.client }));

import { useProviderGate } from './signInProviders';

const user = {
  id: 'u1',
  email: 'lea@id.test',
  username: 'lea',
  permissions: ['playback'],
  libraries: null,
  createdAt: '2026-11-13T10:00:00Z',
  hasPin: false,
};
const session = { token: 't', accessToken: 'a', user };
const keycloak = { id: ProviderId.parse('p0'), label: 'Keycloak', icon: 'key' };
const STARTED = { flowId: 'f1', secret: 's', authorizeUrl: 'https://id.test/a', expiresInSec: 600 };

let server = 0;

function gate(finish: object) {
  const serverUrl = `https://kroma-${server++}.example`;
  const { client, calls } = recordingClient((url) => {
    if (url.endsWith('/auth/sso/finish')) return { json: finish };
    if (url.endsWith('/auth/sso/start')) return { json: STARTED };
    if (url.endsWith('/auth/login')) return { json: session };
    if (url.endsWith('/auth/config')) {
      return {
        json: {
          publicUserList: false,
          hasAccounts: true,
          signIn: { methods: [{ id: 'p0', kind: 'oidc', label: 'Keycloak', icon: 'key' }] },
        },
      };
    }
    return { json: {} };
  });
  made.client = client;
  const deps = {
    session: { serverUrl, adopt: vi.fn(), requestLocale: () => 'en' },
    clientFor: () => client,
    t: (key: string) => key,
    serverName: 'Home',
    enterApp: vi.fn(),
    setBusy: vi.fn(),
    setError: vi.fn(),
  };
  const hook = renderHook(() => useProviderGate(deps));
  return { hook, deps, calls, serverUrl };
}

beforeEach(() => {
  browser.openAuthSessionAsync.mockReset();
  browser.openAuthSessionAsync.mockResolvedValue({
    type: 'success',
    url: 'kroma://sso?flow=f1&code=c',
  });
});

describe('the provider gate', () => {
  it('learns which ways in the server offers', async () => {
    const { hook } = gate({ status: 'signedIn', ...session });

    await waitFor(() => expect(hook.result.current.methods.methods).toHaveLength(1));

    expect(hook.result.current.methods.methods[0]?.kind).toBe('oidc');
  });

  it('opens the session a provider sign-in returned and enters the app', async () => {
    const { hook, deps, serverUrl } = gate({ status: 'signedIn', ...session });

    await act(() => hook.result.current.press(keycloak));

    expect(deps.session.adopt).toHaveBeenCalledWith(
      serverUrl,
      expect.objectContaining({ token: 't' }),
    );
    expect(deps.enterApp).toHaveBeenCalled();
    expect(deps.setBusy).toHaveBeenLastCalledWith(null);
  });

  it('says a join request was sent, as a notice and not as an error', async () => {
    const { hook, deps } = gate({ status: 'requested' });

    await act(() => hook.result.current.press(keycloak));

    expect(hook.result.current.notice).toBe('sso.requested.body');
    expect(deps.setError).not.toHaveBeenCalledWith('sso.requested.body');
    expect(deps.enterApp).not.toHaveBeenCalled();
  });

  it('says why a person was refused, as an error', async () => {
    const { hook, deps } = gate({ status: 'refused', reason: 'group' });

    await act(() => hook.result.current.press(keycloak));

    expect(deps.setError).toHaveBeenCalledWith('sso.refused.group.body');
    expect(hook.result.current.notice).toBeNull();
  });

  it('does nothing when the browser closes with no return', async () => {
    browser.openAuthSessionAsync.mockResolvedValue({ type: 'cancel' });
    const { hook, deps } = gate({ status: 'signedIn', ...session });

    await act(() => hook.result.current.press(keycloak));

    expect(deps.session.adopt).not.toHaveBeenCalled();
    expect(deps.setError).toHaveBeenLastCalledWith(null);
  });

  it('says so when the flow could not begin', async () => {
    browser.openAuthSessionAsync.mockRejectedValue(new Error('no browser'));
    const { hook, deps } = gate({ status: 'signedIn', ...session });

    await act(() => hook.result.current.press(keycloak));

    expect(deps.setError).toHaveBeenLastCalledWith('auth.providerFailed');
  });

  it('links the identity a flow left waiting once the person signs in with a password', async () => {
    const { hook, deps, calls, serverUrl } = gate({ status: 'emailTaken' });
    await act(() => hook.result.current.press(keycloak));

    await act(() => hook.result.current.loginAndClaim('lea', 'pw'));

    const claim = calls.find((call) => call.path === '/auth/sso/claim');
    expect(claim?.body).toEqual({ flowId: 'f1', secret: 's', code: 'c' });
    expect(claim?.headers.get('Authorization')).toBe('Bearer t');
    expect(deps.session.adopt).toHaveBeenCalledWith(
      serverUrl,
      expect.objectContaining({ token: 't' }),
    );
  });

  it('signs in with a password alone when nothing is waiting', async () => {
    const { hook, deps, calls } = gate({ status: 'signedIn', ...session });

    await act(() => hook.result.current.loginAndClaim('lea', 'pw'));

    expect(calls.some((call) => call.path === '/auth/sso/claim')).toBe(false);
    expect(deps.session.adopt).toHaveBeenCalled();
  });
});
