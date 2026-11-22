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
});
