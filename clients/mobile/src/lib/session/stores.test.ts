// @vitest-environment jsdom
//
// The two persisted lists behind a mobile session. `hydrate` seeds from device
// storage and must not write straight back; account identity is the pair
// (server, user), not the user alone.

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const saveAccounts = vi.hoisted(() => vi.fn(async (_: unknown[]) => undefined));
const saveServers = vi.hoisted(() => vi.fn(async (_: unknown[]) => undefined));
vi.mock('#mobile/lib/storage', () => ({ saveAccounts, saveServers }));

import type { MobileAccount, ServerEntry } from '#mobile/lib/storage';
import { sameAccount, useAccountStore, useServerStore } from './stores';

const account = (serverUrl: string, id: string): MobileAccount =>
  ({ serverUrl, accessToken: 't', user: { id, username: id } }) as MobileAccount;

const server = (url: string, over: Partial<ServerEntry> = {}): ServerEntry => ({
  url,
  lastUsedAt: 1,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sameAccount', () => {
  it('matches only when BOTH the server and the user agree', () => {
    const a = account('https://one', 'u1');
    expect(sameAccount(a, 'https://one', 'u1')).toBe(true);
    expect(sameAccount(a, 'https://two', 'u1')).toBe(false);
    expect(sameAccount(a, 'https://one', 'u2')).toBe(false);
  });
});

describe('useAccountStore', () => {
  it('starts empty', () => {
    const { result } = renderHook(() => useAccountStore());
    expect(result.current.accounts).toEqual([]);
    expect(result.current.ref.current).toEqual([]);
  });

  it('persist updates state, the ref and device storage together', () => {
    const { result } = renderHook(() => useAccountStore());
    const next = [account('https://one', 'u1')];
    act(() => result.current.persist(next));

    expect(result.current.accounts).toEqual(next);
    // The ref is what async handlers read, and it must not lag the state.
    expect(result.current.ref.current).toEqual(next);
    expect(saveAccounts).toHaveBeenCalledWith(next);
  });

  it('hydrate seeds without writing back', () => {
    const { result } = renderHook(() => useAccountStore());
    act(() => result.current.hydrate([account('https://one', 'u1')]));

    expect(result.current.accounts).toHaveLength(1);
    expect(result.current.ref.current).toHaveLength(1);
    expect(saveAccounts).not.toHaveBeenCalled();
  });

  it('forget drops exactly one profile', () => {
    const { result } = renderHook(() => useAccountStore());
    act(() =>
      result.current.hydrate([
        account('https://one', 'u1'),
        account('https://one', 'u2'),
        account('https://two', 'u1'),
      ]),
    );
    act(() => result.current.forget('https://one', 'u1'));

    // Keyed on the pair, so the same user id on another server survives.
    expect(result.current.accounts.map((a) => `${a.serverUrl}|${a.user.id}`)).toEqual([
      'https://one|u2',
      'https://two|u1',
    ]);
    expect(saveAccounts).toHaveBeenCalledTimes(1);
  });

  it('forgetting something absent still persists the unchanged list', () => {
    const { result } = renderHook(() => useAccountStore());
    act(() => result.current.hydrate([account('https://one', 'u1')]));
    act(() => result.current.forget('https://nope', 'u9'));
    expect(result.current.accounts).toHaveLength(1);
  });
});

describe('useServerStore', () => {
  it('persist updates state, the ref and device storage together', () => {
    const { result } = renderHook(() => useServerStore());
    const next = [server('https://a')];
    act(() => result.current.persist(next));
    expect(result.current.servers).toEqual(next);
    expect(result.current.ref.current).toEqual(next);
    expect(saveServers).toHaveBeenCalledWith(next);
  });

  it('hydrate seeds without writing back', () => {
    const { result } = renderHook(() => useServerStore());
    act(() => result.current.hydrate([server('https://a')]));
    expect(result.current.servers).toHaveLength(1);
    expect(saveServers).not.toHaveBeenCalled();
  });

  it('touch moves a known server to the front and keeps its name', () => {
    const { result } = renderHook(() => useServerStore());
    act(() =>
      result.current.hydrate([server('https://a', { name: 'Attic' }), server('https://b')]),
    );
    act(() => result.current.touch('https://b'));

    expect(result.current.servers.map((s) => s.url)).toEqual(['https://b', 'https://a']);
    // Touching one must not erase another's label.
    expect(result.current.servers.find((s) => s.url === 'https://a')?.name).toBe('Attic');
  });

  it('touch keeps the existing name when none is supplied', () => {
    const { result } = renderHook(() => useServerStore());
    act(() => result.current.hydrate([server('https://a', { name: 'Attic' })]));
    act(() => result.current.touch('https://a'));
    expect(result.current.servers[0]?.name).toBe('Attic');
  });

  it('touch adopts a fresher name when one is supplied', () => {
    const { result } = renderHook(() => useServerStore());
    act(() => result.current.hydrate([server('https://a', { name: 'Old' })]));
    act(() => result.current.touch('https://a', 'New'));
    expect(result.current.servers[0]?.name).toBe('New');
  });

  it('touch adds a server it has never seen', () => {
    const { result } = renderHook(() => useServerStore());
    act(() => result.current.touch('https://new', 'Fresh'));
    expect(result.current.servers).toHaveLength(1);
    expect(result.current.servers[0]).toMatchObject({ url: 'https://new', name: 'Fresh' });
  });

  it('touch does not duplicate a server it already holds', () => {
    const { result } = renderHook(() => useServerStore());
    act(() => result.current.hydrate([server('https://a')]));
    act(() => result.current.touch('https://a'));
    expect(result.current.servers).toHaveLength(1);
  });

  it('rename writes when the name actually changes', () => {
    const { result } = renderHook(() => useServerStore());
    act(() => result.current.hydrate([server('https://a', { name: 'Old' })]));
    act(() => result.current.rename('https://a', 'New'));
    expect(result.current.servers[0]?.name).toBe('New');
    expect(saveServers).toHaveBeenCalledTimes(1);
  });

  it('rename is a NO-OP when the name is unchanged', () => {
    const { result } = renderHook(() => useServerStore());
    act(() => result.current.hydrate([server('https://a', { name: 'Same' })]));
    act(() => result.current.rename('https://a', 'Same'));
    expect(saveServers).not.toHaveBeenCalled();
  });

  it('rename ignores a server it does not hold', () => {
    const { result } = renderHook(() => useServerStore());
    act(() => result.current.hydrate([server('https://a')]));
    act(() => result.current.rename('https://nope', 'X'));
    expect(saveServers).not.toHaveBeenCalled();
  });

  it('remove drops exactly the one named', () => {
    const { result } = renderHook(() => useServerStore());
    act(() => result.current.hydrate([server('https://a'), server('https://b')]));
    act(() => result.current.remove('https://a'));
    expect(result.current.servers.map((s) => s.url)).toEqual(['https://b']);
    expect(saveServers).toHaveBeenCalledTimes(1);
  });
});
