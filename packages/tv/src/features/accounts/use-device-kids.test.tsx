// @vitest-environment jsdom

import { type KidsProfile, type StoredSession, UserId } from '@kromatv/client/accounts';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import { useDeviceKids } from './use-device-kids.hook';

const SERVER = 'http://tv.local';

interface Mocks {
  login: Mock;
  list: Mock;
  open: Mock;
  servers: string[];
}

const mocks: Mocks = vi.hoisted(() => ({
  login: vi.fn(),
  list: vi.fn(),
  open: vi.fn(),
  servers: [],
}));

vi.mock('#tv/app/providers/auth', () => ({ useAuth: () => ({ login: mocks.login }) }));
vi.mock('#tv/app/providers/connection', () => ({
  useConnectionMaybe: () => ({ platform: 'tizen' }),
}));
vi.mock('#tv/app/api-client', () => ({
  makeClient: (url: string) => {
    mocks.servers.push(url);
    return { accounts: { kids: { list: mocks.list, open: mocks.open } } };
  },
}));

function account(name: string): StoredSession {
  return {
    serverUrl: SERVER,
    accessToken: `${name}-access`,
    user: {
      id: UserId.parse(name),
      email: '',
      username: name,
      createdAt: '',
      hasPin: false,
      permissions: [],
      libraries: null,
    },
  };
}

const kid = (name: string): KidsProfile => ({ id: UserId.parse(name), username: name });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.servers = [];
});

describe('the Kids profiles a television can open', () => {
  it('offers the ones not remembered here, listed by a member of their server', async () => {
    mocks.list.mockResolvedValue([kid('leo'), kid('mia')]);
    const accounts = [account('ana'), account('mia')];

    const { result } = renderHook(() => useDeviceKids(accounts));

    await waitFor(() => expect(result.current.offered).toHaveLength(1));
    expect(result.current.offered[0]?.profile.username).toBe('leo');
    expect(mocks.list).toHaveBeenCalledWith('ana-access');
    expect(mocks.servers).toContain(SERVER);
  });

  it('knows a remembered Kids profile, so its tile carries the mark', async () => {
    mocks.list.mockResolvedValue([kid('mia')]);
    const accounts = [account('ana'), account('mia')];

    const { result } = renderHook(() => useDeviceKids(accounts));

    await waitFor(() => expect(result.current.isKids(account('mia'))).toBe(true));
    expect(result.current.isKids(account('ana'))).toBe(false);
  });

  it('opens one with the member’s access and signs the television in to it', async () => {
    mocks.list.mockResolvedValue([kid('leo')]);
    const opened = { token: 't', accessToken: 'leo-access', user: { id: 'leo' } };
    mocks.open.mockResolvedValue(opened);
    const accounts = [account('ana')];
    const { result } = renderHook(() => useDeviceKids(accounts));
    await waitFor(() => expect(result.current.offered).toHaveLength(1));

    const choice = result.current.offered[0];
    if (choice) {
      await result.current.open(choice);
    }

    expect(mocks.open).toHaveBeenCalledWith('ana-access', UserId.parse('leo'));
    expect(mocks.login).toHaveBeenCalledWith(opened, SERVER);
  });
});
