// @vitest-environment jsdom

import { UserId } from '@kromatv/client/accounts';
import { fakeClient } from '@kromatv/client/test';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { MobileAccount } from '#mobile/lib/storage';
import { type GateTilesInput, useGateTiles } from './use-gate-tiles.hook';

const SERVER = 'https://kroma.local';

interface Mocks {
  open: Mock;
  offered: { serverUrl: string; access: string; profile: { id: string; username: string } }[];
}

const mocks: Mocks = vi.hoisted(() => ({ open: vi.fn(), offered: [] }));

vi.mock('#mobile/lib/i18n', () => ({ useT: () => (key: string) => key }));
vi.mock('#mobile/components/sign-in-hooks', () => ({
  keyOf: (a: MobileAccount) => `${a.serverUrl}::${a.user.id}`,
  useDeviceKids: () => ({
    offered: mocks.offered,
    isKids: (a: MobileAccount) => a.user.id === 'mia',
    open: mocks.open,
  }),
}));

function account(name: string): MobileAccount {
  return {
    serverUrl: SERVER,
    accessToken: `${name}-access`,
    user: {
      id: UserId.parse(name),
      username: name,
      email: '',
      avatarUrl: null,
      hasPin: false,
      permissions: [],
    },
  };
}

function input(over: Partial<GateTilesInput> = {}): GateTilesInput {
  return {
    accounts: [account('ana'), account('mia')],
    roster: [],
    serverUrl: SERVER,
    online: () => true,
    label: () => null,
    busy: null,
    locked: () => false,
    clientFor: () => fakeClient({ media: { artwork: { resolve: () => null } } }),
    onSaved: vi.fn(),
    onRoster: vi.fn(),
    onKidsOpened: vi.fn(),
    onKidsFailed: vi.fn(),
    ...over,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  mocks.offered = [];
});

describe('the gate’s tiles', () => {
  it('marks a remembered Kids profile and nobody else', () => {
    const { result } = renderHook(() => useGateTiles(input()));

    expect(result.current.map((tile) => [tile.name, tile.kids])).toEqual([
      ['ana', false],
      ['mia', true],
    ]);
  });

  it('offers the Kids profiles a member here can open, after the remembered ones', () => {
    mocks.offered = [
      { serverUrl: SERVER, access: 'ana-access', profile: { id: 'leo', username: 'Léo' } },
    ];

    const { result } = renderHook(() => useGateTiles(input()));

    expect(result.current.at(-1)).toMatchObject({ name: 'Léo', kids: true });
  });

  it('opens an offered Kids profile, then enters the app', async () => {
    mocks.offered = [
      { serverUrl: SERVER, access: 'ana-access', profile: { id: 'leo', username: 'Léo' } },
    ];
    mocks.open.mockResolvedValue(undefined);
    const lent = input();
    const { result } = renderHook(() => useGateTiles(lent));

    result.current.at(-1)?.onPress();
    await vi.waitFor(() => expect(lent.onKidsOpened).toHaveBeenCalled());

    expect(mocks.open).toHaveBeenCalledWith(mocks.offered[0]);
  });

  it('says so when an offered Kids profile cannot be opened', async () => {
    mocks.offered = [
      { serverUrl: SERVER, access: 'ana-access', profile: { id: 'leo', username: 'Léo' } },
    ];
    mocks.open.mockRejectedValue(new Error('refused'));
    const lent = input();
    const { result } = renderHook(() => useGateTiles(lent));

    result.current.at(-1)?.onPress();
    await vi.waitFor(() => expect(lent.onKidsFailed).toHaveBeenCalled());

    expect(lent.onKidsOpened).not.toHaveBeenCalled();
  });

  it('enters a remembered profile when its tile is pressed', () => {
    const lent = input();
    const { result } = renderHook(() => useGateTiles(lent));

    result.current[0]?.onPress();

    expect(lent.onSaved).toHaveBeenCalledWith(account('ana'));
  });

  it('captions a tile whose server does not answer as offline', () => {
    const { result } = renderHook(() => useGateTiles(input({ online: () => false })));

    expect(result.current[0]).toMatchObject({ caption: 'profiles.serverOffline', offline: true });
  });

  it('lists the server’s other profiles last, each asking for its password', () => {
    const ben = { id: UserId.parse('ben'), username: 'ben', avatarUrl: null, hasPin: true };
    const lent = input({ roster: [ben] });
    const { result } = renderHook(() => useGateTiles(lent));

    const last = result.current.at(-1);
    last?.onPress();

    expect(last).toMatchObject({ name: 'ben', locked: true });
    expect(lent.onRoster).toHaveBeenCalledWith(ben);
  });

  it('draws no picture for the roster before a server is picked', () => {
    const ben = { id: UserId.parse('ben'), username: 'ben', avatarUrl: null, hasPin: false };

    const { result } = renderHook(() => useGateTiles(input({ roster: [ben], serverUrl: null })));

    expect(result.current.at(-1)?.avatarUri).toBeNull();
  });
});
