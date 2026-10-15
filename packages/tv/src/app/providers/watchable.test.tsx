// @vitest-environment jsdom

import { I18nProvider } from '@kromatv/ui';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const server = vi.hoisted(() => {
  const read = vi.fn();
  const on = vi.fn();
  const list = vi.fn();
  return {
    read,
    on,
    list,
    signedIn: true,
    client: { capabilities: { read }, watchable: { on } },
    user: { id: 'u1' },
  };
});

vi.mock('#tv/app/providers/auth', () => ({
  useAuth: () => ({ user: server.signedIn ? server.user : null, ready: true }),
}));
vi.mock('#tv/app/providers/connection', () => ({
  useConnection: () => ({ client: server.client }),
}));

import { TARGET } from '@kromatv/core/test';
import { useWatchable, WatchableProvider } from '#tv/app/providers/watchable';

const ENTRY = TARGET.entry;

const MOUNTED = { mount: '/api/module/tv.kroma.torrents' };
const USENET = '/api/module/tv.kroma.usenet';

const named = (mount: string, label: string) => ({ mount, label, figures: [], actions: [] });

const twoWays = {
  watchable: {
    ...MOUNTED,
    sources: [named(MOUNTED.mount, 'Torrents'), named(USENET, 'Usenet')],
  },
};

const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
  <I18nProvider locale="en">
    <WatchableProvider>{children}</WatchableProvider>
  </I18nProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  server.signedIn = true;
  server.client = { capabilities: { read: server.read }, watchable: { on: server.on } };
  server.read.mockResolvedValue({ watchable: MOUNTED });
  server.list.mockResolvedValue({ entries: [ENTRY] });
  server.on.mockReturnValue({ list: server.list });
});

describe('what this server can play before it holds it', () => {
  it('lists what is arriving where a module answers the capability', async () => {
    const { result } = renderHook(useWatchable, { wrapper });

    await waitFor(() => expect(result.current.entries).toEqual([ENTRY]));

    expect(result.current.api).not.toBeNull();
  });

  it('offers nothing where no module answers it, and asks for no listing', async () => {
    server.read.mockResolvedValue({});

    const { result } = renderHook(useWatchable, { wrapper });

    await waitFor(() => expect(result.current.api).toBeNull());
    expect(result.current.entries).toEqual([]);
    expect(server.list).not.toHaveBeenCalled();
  });

  it('offers every way two modules answer it with, and lists through none of them', async () => {
    server.read.mockResolvedValue(twoWays);

    const { result } = renderHook(useWatchable, { wrapper });

    await waitFor(() => expect(result.current.sources).toHaveLength(2));
    expect(result.current.entries).toEqual([]);
    expect(server.on).not.toHaveBeenCalled();
  });

  it('lists through the source a viewer picked', async () => {
    server.read.mockResolvedValue(twoWays);
    const { result } = renderHook(useWatchable, { wrapper });
    await waitFor(() => expect(result.current.sources).toHaveLength(2));

    act(() => result.current.choose(USENET));

    await waitFor(() => expect(result.current.entries).toEqual([ENTRY]));
    expect(server.on).toHaveBeenCalledWith(USENET);
  });

  it('asks nothing of a server nobody has signed in to', async () => {
    server.signedIn = false;

    const { result } = renderHook(useWatchable, { wrapper });

    await waitFor(() => expect(result.current.api).toBeNull());
    expect(server.read).not.toHaveBeenCalled();
  });
});
