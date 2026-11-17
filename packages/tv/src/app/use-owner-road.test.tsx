// @vitest-environment jsdom

import type { KromaClient } from '@kromatv/client';
import { fakeClient } from '@kromatv/client/test';
import { I18nProvider } from '@kromatv/ui';
import { createInputTestHost } from '@kromatv/ui/testing';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OWNER_RECHECK_MS } from '#tv/app/owner-watch';
import { AuthProvider, useAuth } from '#tv/app/providers/auth';
import { ServerOwnerProvider } from '#tv/app/providers/server-owner';
import {
  type AskConfig,
  EMPTY_SERVER,
  OWNED_SERVER,
  pairedSession,
  unreachable,
} from '#tv/app/providers/server-owner.fixture';
import { TvClientProvider, type TvNav, TvNavProvider, TvOutlet, useNav } from '#tv/app/router';
import { stubScreens } from '#tv/app/router.fixtures';
import { useOwnerRoad } from '#tv/app/use-owner-road.hook';
import { TvServerUnowned } from '#tv/features/accounts/tv-server-unowned.component';

const NOTICE = 'This server is not set up yet';

const noop = () => undefined;

const inputHost = createInputTestHost();

let nav: TvNav | null = null;
let auth: ReturnType<typeof useAuth> | null = null;

function Road() {
  const currentNav = useNav();
  const currentAuth = useAuth();
  useEffect(() => {
    nav = currentNav;
    auth = currentAuth;
  });
  useOwnerRoad();
  return <TvOutlet />;
}

function television(client: KromaClient) {
  return (
    <I18nProvider locale="en">
      <TvNavProvider screens={stubScreens({ unowned: TvServerUnowned })}>
        <TvClientProvider client={client}>
          <AuthProvider
            client={client}
            activeServerUrl={client.baseUrl}
            setActiveServer={noop}
            onSignedInChange={noop}
          >
            <ServerOwnerProvider client={client}>
              <Road />
            </ServerOwnerProvider>
          </AuthProvider>
        </TvClientProvider>
      </TvNavProvider>
    </I18nProvider>
  );
}

const settle = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms));

async function reach(config: AskConfig) {
  inputHost.render(television(fakeClient({ accounts: { config } })));
  await settle();
  inputHost.clearPressGuard();
}

const signIn = () => auth?.login(pairedSession(), 'http://kroma.test');

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
  sessionStorage.clear();
  nav = null;
  auth = null;
});

describe('a television that reaches a server', () => {
  it('says so when the server has no account, and shows the address to open', async () => {
    await reach(() => Promise.resolve(EMPTY_SERVER));

    expect(screen.getByText(NOTICE)).toBeTruthy();
    expect(screen.getByText('http://kroma.test')).toBeTruthy();
    expect(screen.getByText(/open this address in a browser/)).toBeTruthy();
  });

  it('offers one control on the notice, and it is where the remote lands', async () => {
    await reach(() => Promise.resolve(EMPTY_SERVER));

    const controls = screen.getAllByRole('button');

    expect(controls).toHaveLength(1);
    expect(controls[0]?.textContent).toContain('Check again');
    expect(document.activeElement).toBe(controls[0]);
  });

  it('does not take a server that cannot be reached for an empty one', async () => {
    await reach(unreachable);

    expect(screen.getByText('screen:profiles')).toBeTruthy();
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('goes on to the picker when the server has an account', async () => {
    await reach(() => Promise.resolve(OWNED_SERVER));

    expect(screen.getByText('screen:profiles')).toBeTruthy();
  });

  it('gives way to pairing by itself once the server reports an account', async () => {
    await reach(
      vi.fn<AskConfig>().mockResolvedValueOnce(EMPTY_SERVER).mockResolvedValue(OWNED_SERVER),
    );

    await settle(OWNER_RECHECK_MS);

    expect(screen.getByText('screen:quick')).toBeTruthy();
    expect(screen.queryByText(NOTICE)).toBeNull();
  });

  it('asks the server at once when the person presses the control', async () => {
    await reach(
      vi.fn<AskConfig>().mockResolvedValueOnce(EMPTY_SERVER).mockResolvedValue(OWNED_SERVER),
    );

    fireEvent.click(screen.getByRole('button'));
    await settle();

    expect(screen.getByText('screen:quick')).toBeTruthy();
  });

  it('keeps the notice when the server still has no account', async () => {
    const config = vi.fn<AskConfig>().mockResolvedValue(EMPTY_SERVER);
    await reach(config);

    fireEvent.click(screen.getByRole('button'));
    await settle();

    expect(screen.getByText(NOTICE)).toBeTruthy();
    expect(config).toHaveBeenCalledTimes(2);
  });

  it('leaves the notice on Back, and does not open it a second time', async () => {
    await reach(() => Promise.resolve(EMPTY_SERVER));

    act(() => nav?.back());
    await settle(OWNER_RECHECK_MS);

    expect(screen.getByText('screen:profiles')).toBeTruthy();
  });

  it('shows the notice in place of the pairing code when that server is picked again', async () => {
    await reach(() => Promise.resolve(EMPTY_SERVER));
    act(() => nav?.back());

    act(() => nav?.go('quick'));
    await settle();

    expect(screen.getByText(NOTICE)).toBeTruthy();
    expect(screen.queryByText('screen:quick')).toBeNull();
  });

  it('moves nothing once the television is signed in', async () => {
    await reach(() => Promise.resolve(EMPTY_SERVER));

    act(signIn);
    await settle();

    expect(screen.queryByText('screen:quick')).toBeNull();
  });
});
