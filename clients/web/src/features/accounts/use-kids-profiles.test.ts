// @vitest-environment jsdom
import { type KidsProfile, type StoredSession, UserId } from '@kromatv/client/accounts';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useKidsProfiles } from './use-kids-profiles.hook';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({ client: { accounts: { kids: { list: mocks.list } } } }),
}));

function account(name: string): StoredSession {
  return {
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

const leo: KidsProfile = { id: UserId.parse('leo'), username: 'Léo' };

const noop = () => undefined;

function deferred<T>() {
  let settle: (value: T) => void = noop;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle: (value: T) => settle(value) };
}

afterEach(() => {
  mocks.list.mockReset();
});

describe('the Kids profiles a browser can open', () => {
  it('lists them with the access of a member remembered here', async () => {
    mocks.list.mockResolvedValue([leo]);
    const accounts = [account('ana')];

    const { result } = renderHook(() => useKidsProfiles(accounts));

    await waitFor(() => expect(result.current.profiles).toEqual([leo]));
    expect(result.current.access).toBe('ana-access');
  });

  it('lists none when no member here is answered', async () => {
    mocks.list.mockRejectedValue(new Error('refused'));
    const accounts = [account('ana')];

    const { result } = renderHook(() => useKidsProfiles(accounts));

    await waitFor(() => expect(mocks.list).toHaveBeenCalled());
    expect(result.current).toEqual({ access: null, profiles: [] });
  });

  it('drops an answer that arrives after the picker has gone', async () => {
    const answer = deferred<KidsProfile[]>();
    mocks.list.mockReturnValue(answer.promise);
    const accounts = [account('ana')];
    const { result, unmount } = renderHook(() => useKidsProfiles(accounts));

    unmount();
    answer.settle([leo]);
    await Promise.resolve();

    expect(result.current.profiles).toEqual([]);
  });
});
