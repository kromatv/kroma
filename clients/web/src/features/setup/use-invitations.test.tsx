// @vitest-environment jsdom

import { Invite, InviteToken } from '@kromatv/client/accounts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const accounts = vi.hoisted(() => ({
  invites: vi.fn(),
  createInvite: vi.fn(),
  revokeInvite: vi.fn(),
}));

vi.mock('#web/shared/lib/web-runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('#web/shared/lib/web-runtime')>();
  const { createWebTestRuntime } = await import('#web/shared/lib/web-runtime.fixture');
  const runtime = createWebTestRuntime({ accounts });
  return { ...original, useWebRuntime: () => runtime, useKromaClient: () => runtime.client };
});

import {
  invitationLink,
  invitationMail,
  openInvitations,
  useInvitations,
} from './use-invitations.hook';

const HERE = 'http://localhost';
const NOTIFY_MS = 1;
const SERVER_LINK = 'https://kroma.test/join/made-by-the-server';

function invitation(over: { used?: boolean } = {}) {
  return Invite.parse({
    token: crypto.randomUUID(),
    permissions: ['playback'],
    createdAt: '2026-11-01T10:00:00Z',
    expiresAt: 1_800_000_000,
    used: false,
    ...over,
  });
}

function created(invite: Invite, url: string | null) {
  return { token: invite.token, permissions: invite.permissions, expiresAt: invite.expiresAt, url };
}

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

async function answered() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(NOTIFY_MS);
  });
}

async function renderInvitations(held: Invite[]) {
  accounts.invites.mockResolvedValue(held);
  const rendered = renderHook(() => useInvitations(), { wrapper: wrapper() });
  await answered();
  return rendered;
}

beforeEach(() => {
  accounts.invites.mockReset().mockResolvedValue([]);
  accounts.createInvite.mockReset();
  accounts.revokeInvite.mockReset().mockResolvedValue(undefined);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the address of an invitation', () => {
  it('is the one the server made for it', () => {
    const token = InviteToken.parse(crypto.randomUUID());

    expect(invitationLink({ url: SERVER_LINK, token }, HERE)).toBe(SERVER_LINK);
  });

  it('is the join page of this address when the server made none', () => {
    const token = InviteToken.parse(crypto.randomUUID());

    expect(invitationLink({ url: null, token }, HERE)).toBe(`${HERE}/join?invite=${token}`);
  });
});

describe('the invitations still open', () => {
  it('are the ones nobody has redeemed', () => {
    const open = invitation();

    expect(openInvitations([invitation({ used: true }), open])).toEqual([open]);
  });
});

describe('the mail that carries an invitation', () => {
  it('opens the mail program of the owner with the subject and the body escaped', () => {
    const mail = invitationMail({
      subject: 'Join us & watch',
      body: 'Open https://kroma.test/?a=b',
    });

    expect(mail).toBe(
      'mailto:?subject=Join%20us%20%26%20watch&body=Open%20https%3A%2F%2Fkroma.test%2F%3Fa%3Db',
    );
  });
});

describe('the invitations the owner sees', () => {
  it('are none before the server has answered', () => {
    accounts.invites.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useInvitations(), { wrapper: wrapper() });

    expect(result.current.open).toEqual([]);
  });

  it('are the open ones the server holds', async () => {
    const open = invitation();

    const { result } = await renderInvitations([open, invitation({ used: true })]);

    expect(result.current.open).toEqual([open]);
  });

  it('lead to the join page of this address when the owner did not create them here', async () => {
    const open = invitation();

    const { result } = await renderInvitations([open]);

    expect(result.current.linkOf(open)).toBe(`${HERE}/join?invite=${open.token}`);
  });
});

describe('creating an invitation', () => {
  it('asks the server for one with the rights the owner chose', async () => {
    const made = invitation();
    accounts.createInvite.mockResolvedValue(created(made, SERVER_LINK));
    const { result } = await renderInvitations([]);

    await act(() => result.current.create(['playback', 'requests.create']));

    expect(accounts.createInvite).toHaveBeenCalledWith({
      permissions: ['playback', 'requests.create'],
    });
  });

  it('shows the new invitation with the address the server made for it', async () => {
    const made = invitation();
    accounts.createInvite.mockResolvedValue(created(made, SERVER_LINK));
    const { result } = await renderInvitations([]);
    accounts.invites.mockResolvedValue([made]);

    await act(() => result.current.create());
    await answered();

    expect(result.current.open).toEqual([made]);
    expect(result.current.linkOf(made)).toBe(SERVER_LINK);
  });

  it('keeps the owner waiting until the server has answered', async () => {
    accounts.createInvite.mockReturnValue(new Promise(() => {}));
    const { result } = await renderInvitations([]);

    act(() => {
      void result.current.create();
    });

    expect(result.current.busy).toBe(true);
  });

  it('frees the owner and lists the invitations again when the server refuses', async () => {
    accounts.createInvite.mockRejectedValue(new Error('refused'));
    const { result } = await renderInvitations([]);

    const failure = await act(() => result.current.create().catch((error: unknown) => error));

    expect(failure).toEqual(new Error('refused'));
    expect(result.current.busy).toBe(false);
    expect(accounts.invites).toHaveBeenCalledTimes(2);
  });
});

describe('revoking an invitation', () => {
  it('takes it off the list', async () => {
    const open = invitation();
    const { result } = await renderInvitations([open]);
    accounts.invites.mockResolvedValue([]);

    await act(() => result.current.revoke(open.token));
    await answered();

    expect(accounts.revokeInvite).toHaveBeenCalledWith(open.token);
    expect(result.current.open).toEqual([]);
  });

  it('lists the invitations again even when the server refuses', async () => {
    const open = invitation();
    accounts.revokeInvite.mockRejectedValue(new Error('already gone'));
    const { result } = await renderInvitations([open]);

    await act(() => result.current.revoke(open.token));

    expect(accounts.invites).toHaveBeenCalledTimes(2);
  });
});

describe('changing the rights of an invitation', () => {
  it('revokes the old one, then makes a new one with the new rights', async () => {
    const old = invitation();
    accounts.createInvite.mockResolvedValue(created(invitation(), SERVER_LINK));
    const { result } = await renderInvitations([old]);

    await act(() => result.current.change(old.token, ['requests.create']));

    expect(accounts.revokeInvite).toHaveBeenCalledWith(old.token);
    expect(accounts.createInvite).toHaveBeenCalledWith({ permissions: ['requests.create'] });
    expect(accounts.revokeInvite.mock.invocationCallOrder[0]).toBeLessThan(
      accounts.createInvite.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('makes no new one while the old one still works', async () => {
    const old = invitation();
    accounts.revokeInvite.mockRejectedValue(new Error('offline'));
    const { result } = await renderInvitations([old]);

    await act(() => result.current.change(old.token, ['requests.create']).catch(() => undefined));

    expect(accounts.createInvite).not.toHaveBeenCalled();
  });
});
