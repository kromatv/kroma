// @vitest-environment jsdom
import { setSessionToken, UserId } from '@kroma/core';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '#tv/app/providers/auth';
import { ConnectionProvider } from '#tv/app/providers/connection';
import { ContinueProvider } from '#tv/app/providers/continue';
import { EnvProvider } from '#tv/app/providers/env';
import { MyListProvider } from '#tv/app/providers/mylist';
import { RecommendProvider } from '#tv/app/providers/recommend';
import { WatchedProvider } from '#tv/app/providers/watched';
import { useCatalogue } from '#tv/app/useCatalogue';
import { HandoffBeaconProvider } from '#tv/features/accounts/HandoffBeaconProvider';

const SERVER = 'http://tv.local';
const ACCESS_TOKEN = 'access-1';
const sessionTokenOf = (exchange: number) => `session-${exchange}`;
const USER = {
  id: UserId.of('u1'),
  email: 'alex@kroma.tv',
  username: 'Alex',
  permissions: [],
  createdAt: '2026-01-01T00:00:00Z',
  hasPin: false,
};

const BODIES: Record<string, unknown> = {
  '/movies': [],
  '/shows': [],
  '/home': [],
  '/home/featured': null,
  '/continue': [],
  '/watched': [],
  '/my-list': [],
  '/health': { version: '1.0.0' },
};

interface Call {
  method: string;
  path: string;
  authed: boolean;
}

const calls: Call[] = [];
const sockets: string[] = [];
let exchanges = 0;
// Which exchange the access token stops being good for: 1 is a token already
// dead at boot, 2 is one that dies once the bearer it minted is refused.
let exchangeFailsFrom = Number.POSITIVE_INFINITY;
// Which exchange mints a bearer the server will honour: 2 leaves the boot's
// bearer refused, which is how a session token that expires mid-use reads.
let bearerAcceptedFrom = 1;
let bearer = '';

// Only the three fields the client reads on the way out of `fetch`, so nothing
// here depends on the runner having a real `Response`.
function reply(status: number, body: unknown) {
  return {
    ok: status < 300,
    status,
    body: null,
    text: async () => JSON.stringify(body ?? null),
  } as unknown as Response;
}

// The server this TV boots against: `/auth/token` mints the bearer, and
// everything else answers 401 without it, exactly as the real one does.
function serve(input: string | URL | Request, init?: RequestInit) {
  const path = new URL(String(input)).pathname.replace(/^\/api/, '');
  const sent = new Headers(init?.headers).get('authorization');
  const authed = Boolean(bearer) && sent === `Bearer ${bearer}`;
  calls.push({ method: init?.method ?? 'GET', path, authed });
  if (path === '/auth/token') {
    exchanges += 1;
    if (exchanges >= exchangeFailsFrom) return reply(401, { error: 'token invalid' });
    const token = sessionTokenOf(exchanges);
    if (exchanges >= bearerAcceptedFrom) bearer = token;
    return reply(200, { token, user: USER });
  }
  if (!authed) return reply(401, { error: 'unauthorized' });
  return reply(200, BODIES[path] ?? null);
}

class SilentSocket {
  readyState = 0;
  constructor(_url: string, protocol?: string) {
    sockets.push(protocol ?? '');
  }
  close() {}
}

let auth: ReturnType<typeof useAuth> | null = null;

function CaptureAuth() {
  auth = useAuth();
  return null;
}

function TvBoot() {
  const { connection, client, activeServerUrl, setActiveServer, setSignedIn } =
    useCatalogue('Tizen');
  return (
    <EnvProvider platform="Tizen">
      <ConnectionProvider value={connection}>
        <AuthProvider
          client={client}
          activeServerUrl={activeServerUrl}
          setActiveServer={setActiveServer}
          onSignedInChange={setSignedIn}
        >
          <CaptureAuth />
          <ContinueProvider>
            <RecommendProvider>
              <MyListProvider>
                <WatchedProvider>
                  <HandoffBeaconProvider client={client} name="Salon">
                    <span>tv</span>
                  </HandoffBeaconProvider>
                </WatchedProvider>
              </MyListProvider>
            </RecommendProvider>
          </ContinueProvider>
        </AuthProvider>
      </ConnectionProvider>
    </EnvProvider>
  );
}

async function flush() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 0));
    });
  }
}

async function boot() {
  render(<TvBoot />);
  await flush();
}

const ACCOUNT = { accessToken: ACCESS_TOKEN, user: USER, serverUrl: SERVER };

function rememberSession() {
  localStorage.setItem('kroma.session', JSON.stringify(ACCOUNT));
  localStorage.setItem('kroma.accounts', JSON.stringify([ACCOUNT]));
  localStorage.setItem(
    'kroma.servers',
    JSON.stringify([{ url: SERVER, name: 'Salon', lastUsedAt: 1 }]),
  );
}

beforeEach(() => {
  localStorage.clear();
  calls.length = 0;
  sockets.length = 0;
  exchanges = 0;
  exchangeFailsFrom = Number.POSITIVE_INFINITY;
  bearerAcceptedFrom = 1;
  bearer = '';
  auth = null;
  setSessionToken(undefined);
  vi.stubGlobal('fetch', vi.fn(serve));
  vi.stubGlobal('WebSocket', SilentSocket);
  rememberSession();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('TV boot with a remembered session', () => {
  it('sends nothing before the token exchange has answered', async () => {
    await boot();

    expect(calls[0]).toMatchObject({ method: 'POST', path: '/auth/token' });
    expect(calls.filter((c) => !c.authed && c.path !== '/auth/token')).toEqual([]);
  });

  it('exchanges the access token once and asks for each screen once', async () => {
    await boot();

    expect(calls.map((c) => c.path).sort()).toEqual([
      '/auth/token',
      '/continue',
      '/health',
      '/home',
      '/home/featured',
      '/movies',
      '/my-list',
      '/shows',
      '/watched',
    ]);
  });

  it('opens the event socket with the minted bearer, never without one', async () => {
    await boot();

    expect(sockets).toEqual([`kroma.session.${sessionTokenOf(1)}`]);
  });
});

describe('picking a profile on a signed-out TV', () => {
  it('holds every request until the profile it picked has a bearer', async () => {
    localStorage.removeItem('kroma.session');
    await boot();
    calls.length = 0;

    act(() => auth?.activate(ACCOUNT));
    await flush();

    expect(calls[0]).toMatchObject({ method: 'POST', path: '/auth/token' });
    expect(calls.filter((c) => !c.authed && c.path !== '/auth/token')).toEqual([]);
    expect(calls.filter((c) => c.path === '/watched')).toHaveLength(1);
  });
});

describe('TV boot with a dead access token', () => {
  it('lands on the picker without spending a request on the catalogue', async () => {
    exchangeFailsFrom = 1;
    await boot();

    // The picker's handoff beacon is the one thing a signed-out TV does ask for.
    expect(calls.map((c) => c.path)).toEqual(['/auth/token', '/handoff/announce']);
    expect(localStorage.getItem('kroma.session')).toBeNull();
    expect(sockets).toEqual([]);
  });
});

describe('a bearer the server refuses mid-session', () => {
  it('re-exchanges once for the whole screen and asks each screen once more', async () => {
    bearerAcceptedFrom = 2;
    await boot();

    expect(calls.filter((c) => c.path === '/auth/token')).toHaveLength(2);
    // The 401 and its retry, and no third round: the exchange returned the user
    // the TV already had, so nothing downstream has a reason to ask again.
    for (const path of ['/watched', '/my-list', '/home', '/continue']) {
      expect(calls.filter((c) => c.path === path)).toHaveLength(2);
    }
  });

  it('lands on the picker when the access token behind it is dead too', async () => {
    bearerAcceptedFrom = 2;
    exchangeFailsFrom = 2;
    await boot();

    expect(calls.filter((c) => c.path === '/auth/token')).toHaveLength(2);
    expect(calls.filter((c) => c.path === '/watched')).toHaveLength(1);
    expect(localStorage.getItem('kroma.session')).toBeNull();
  });
});
