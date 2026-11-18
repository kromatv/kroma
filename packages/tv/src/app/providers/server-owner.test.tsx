// @vitest-environment jsdom

import type { KromaClient } from '@kromatv/client';
import { fakeClient } from '@kromatv/client/test';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OWNER_RECHECK_MS } from '#tv/app/owner-watch';
import { AuthProvider, useAuth } from '#tv/app/providers/auth';
import { canPair, ServerOwnerProvider, useServerOwner } from '#tv/app/providers/server-owner';
import {
  type AskConfig,
  EMPTY_SERVER,
  OWNED_SERVER,
  pairedSession,
  unreachable,
} from '#tv/app/providers/server-owner.fixture';

const noop = () => undefined;

let auth: ReturnType<typeof useAuth> | null = null;

function CaptureAuth() {
  const current = useAuth();
  useEffect(() => {
    auth = current;
  });
  return null;
}

function Owner() {
  const { owner, recheck } = useServerOwner();
  return (
    <button type="button" onClick={recheck}>
      {owner}
    </button>
  );
}

function tree(client: KromaClient) {
  return (
    <AuthProvider
      client={client}
      activeServerUrl={client.baseUrl}
      setActiveServer={noop}
      onSignedInChange={noop}
    >
      <CaptureAuth />
      <ServerOwnerProvider client={client}>
        <Owner />
      </ServerOwnerProvider>
    </AuthProvider>
  );
}

async function mount(config: AskConfig) {
  const client = fakeClient({ accounts: { config, relock: () => Promise.resolve() } });
  const view = render(tree(client));
  await settle();
  return view;
}

const signIn = () => auth?.login(pairedSession(), 'http://kroma.test');

const settle = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms));

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
  auth = null;
});

describe('ServerOwnerProvider', () => {
  it('says checking until the server answers', () => {
    const client = fakeClient({
      accounts: { config: () => new Promise<typeof EMPTY_SERVER>(noop) },
    });

    render(tree(client));

    expect(screen.getByText('checking')).toBeTruthy();
  });

  it('says a server that answered with no account is missing its owner', async () => {
    await mount(() => Promise.resolve(EMPTY_SERVER));

    expect(screen.getByText('missing')).toBeTruthy();
  });

  it('does not read a server that cannot be reached as an empty server', async () => {
    await mount(unreachable);

    expect(screen.getByText('unknown')).toBeTruthy();
  });

  it('asks again by itself, and stops once the server reports an account', async () => {
    const config = vi
      .fn<AskConfig>()
      .mockResolvedValueOnce(EMPTY_SERVER)
      .mockResolvedValue(OWNED_SERVER);
    await mount(config);

    await settle(OWNER_RECHECK_MS);
    await settle(3 * OWNER_RECHECK_MS);

    expect(screen.getByText('present')).toBeTruthy();
    expect(config).toHaveBeenCalledTimes(2);
  });

  it('asks at once when the person asks for it', async () => {
    const config = vi
      .fn<AskConfig>()
      .mockResolvedValueOnce(EMPTY_SERVER)
      .mockResolvedValue(OWNED_SERVER);
    await mount(config);

    fireEvent.click(screen.getByText('missing'));
    await settle();

    expect(screen.getByText('present')).toBeTruthy();
  });

  it('keeps the last answer of a server that stops answering', async () => {
    const config = vi
      .fn<AskConfig>()
      .mockResolvedValueOnce(EMPTY_SERVER)
      .mockImplementation(unreachable);
    await mount(config);

    await settle(OWNER_RECHECK_MS);

    expect(screen.getByText('missing')).toBeTruthy();
    expect(config).toHaveBeenCalledTimes(2);
  });

  it('starts over when the television turns to another server', async () => {
    const view = await mount(() => Promise.resolve(EMPTY_SERVER));
    const other = fakeClient({ accounts: { config: () => Promise.resolve(OWNED_SERVER) } });

    view.rerender(tree(other));
    const before = screen.getByRole('button').textContent;
    await settle();

    expect(before).toBe('checking');
    expect(screen.getByText('present')).toBeTruthy();
  });

  it('takes a signed-in television as proof of an account, and asks no more', async () => {
    const config = vi.fn<AskConfig>().mockResolvedValue(EMPTY_SERVER);
    await mount(config);

    act(signIn);
    await settle(3 * OWNER_RECHECK_MS);

    expect(screen.getByText('present')).toBeTruthy();
    expect(config).toHaveBeenCalledOnce();
  });

  it('asks afresh after a sign-out, in place of the answer it had before the sign-in', async () => {
    const config = vi
      .fn<AskConfig>()
      .mockResolvedValueOnce(EMPTY_SERVER)
      .mockResolvedValue(OWNED_SERVER);
    await mount(config);
    act(signIn);

    act(() => auth?.switchProfile());
    const before = screen.getByRole('button').textContent;
    await settle();

    expect(before).toBe('checking');
    expect(screen.getByText('present')).toBeTruthy();
  });
});

describe('useServerOwner', () => {
  it('refuses to run outside its provider', () => {
    const silenced = vi.spyOn(console, 'error').mockImplementation(noop);

    expect(() => render(<Owner />)).toThrow('<ServerOwnerProvider>');

    silenced.mockRestore();
  });
});

describe('canPair', () => {
  it('opens the pairing road for a server with an account, or one that did not answer', () => {
    expect(canPair('present')).toBe(true);
    expect(canPair('unknown')).toBe(true);
  });

  it('holds the pairing road while the server has no account, or has not answered yet', () => {
    expect(canPair('missing')).toBe(false);
    expect(canPair('checking')).toBe(false);
  });
});
