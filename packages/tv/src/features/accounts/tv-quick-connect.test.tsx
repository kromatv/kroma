// @vitest-environment jsdom

import type { QuickConnectInit } from '@kromatv/client/accounts';
import { fakeClient } from '@kromatv/client/test';
import { onScreen } from '@kromatv/ui/testing';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '#tv/app/providers/auth';
import { ConnectionProvider } from '#tv/app/providers/connection';
import { connectionWith } from '#tv/app/providers/connection.fixture';
import { ServerOwnerProvider } from '#tv/app/providers/server-owner';
import {
  type AskConfig,
  EMPTY_SERVER,
  OWNED_SERVER,
  unreachable,
} from '#tv/app/providers/server-owner.fixture';
import { TvNavProvider } from '#tv/app/router';
import { stubScreens } from '#tv/app/router.fixtures';
import { TvQuickConnect } from '#tv/features/accounts/tv-quick-connect.component';

const CODE = '4821';

const noop = () => undefined;

type Initiate = () => Promise<QuickConnectInit>;

const pairing = (): Promise<QuickConnectInit> =>
  Promise.resolve({
    code: CODE,
    secret: crypto.randomUUID(),
    expiresInSec: 300,
    authorizeUrl: null,
  });

const poll = () => Promise.resolve({ status: 'pending' as const });

const settle = () => act(() => vi.advanceTimersByTimeAsync(0));

async function open(config: AskConfig, initiate: Initiate) {
  const client = fakeClient({ accounts: { config, quickConnect: { initiate, poll } } });
  const connection = connectionWith({ client, activeServerUrl: client.baseUrl });
  render(
    onScreen(
      <TvNavProvider screens={stubScreens()}>
        <ConnectionProvider value={connection}>
          <AuthProvider
            client={client}
            activeServerUrl={client.baseUrl}
            setActiveServer={noop}
            onSignedInChange={noop}
          >
            <ServerOwnerProvider client={client}>
              <TvQuickConnect />
            </ServerOwnerProvider>
          </AuthProvider>
        </ConnectionProvider>
      </TvNavProvider>,
    ),
  );
  await settle();
}

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
  sessionStorage.clear();
});

describe('TvQuickConnect', () => {
  it('shows a pairing code on a server that has an account', async () => {
    const initiate = vi.fn<Initiate>(pairing);

    await open(() => Promise.resolve(OWNED_SERVER), initiate);

    expect(screen.getByText(CODE)).toBeTruthy();
    expect(initiate).toHaveBeenCalledOnce();
  });

  it('asks for no pairing code while the server has no account', async () => {
    const initiate = vi.fn<Initiate>(pairing);

    await open(() => Promise.resolve(EMPTY_SERVER), initiate);

    expect(initiate).not.toHaveBeenCalled();
    expect(screen.queryByText(CODE)).toBeNull();
  });

  it('asks for no pairing code before the server has said whether it has an account', async () => {
    const initiate = vi.fn<Initiate>(pairing);

    await open(() => new Promise<typeof EMPTY_SERVER>(noop), initiate);

    expect(initiate).not.toHaveBeenCalled();
  });

  it('still tries a server that did not answer, and reports that failure itself', async () => {
    await open(unreachable, unreachable);

    expect(screen.getByText('Quick Connect unavailable')).toBeTruthy();
  });
});
