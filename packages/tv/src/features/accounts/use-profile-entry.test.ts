// @vitest-environment jsdom

import { type StoredSession, UserId } from '@kromatv/client/accounts';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import { useProfileEntry } from './use-profile-entry.hook';

interface Mocks {
  activate: Mock;
  go: Mock;
  unlocked: boolean;
}

const mocks: Mocks = vi.hoisted(() => ({ activate: vi.fn(), go: vi.fn(), unlocked: false }));

vi.mock('#tv/app/providers/auth', () => ({
  useAuth: () => ({ activate: mocks.activate, isUnlocked: () => mocks.unlocked }),
}));
vi.mock('#tv/app/router', () => ({ useNav: () => ({ go: mocks.go }) }));

function account(name: string, { hasPin = false }: { hasPin?: boolean } = {}): StoredSession {
  return {
    serverUrl: 'http://tv.local',
    accessToken: `${name}-access`,
    user: {
      id: UserId.parse(name),
      email: '',
      username: name,
      createdAt: '',
      hasPin,
      permissions: [],
      libraries: null,
    },
  };
}

const entry = () => renderHook(() => useProfileEntry()).result.current;

afterEach(() => {
  vi.clearAllMocks();
  mocks.unlocked = false;
});

describe('a remembered profile pressed on the television’s picker', () => {
  it('signs in at once when the profile has no PIN', () => {
    entry().enter(account('ana'));

    expect(mocks.activate).toHaveBeenCalledWith(account('ana'));
    expect(mocks.go).not.toHaveBeenCalled();
  });

  it('asks its PIN first when it has one', () => {
    entry().enter(account('ana', { hasPin: true }));

    expect(mocks.go).toHaveBeenCalledWith('pin', { account: account('ana', { hasPin: true }) });
    expect(mocks.activate).not.toHaveBeenCalled();
  });

  it('signs in at once when its PIN was already given on this television', () => {
    mocks.unlocked = true;

    entry().enter(account('ana', { hasPin: true }));

    expect(mocks.activate).toHaveBeenCalled();
  });
});

describe('the Kids door on the television’s picker', () => {
  it('enters the admin, then opens the Kids profile form', () => {
    entry().addKids(account('max'));

    expect(mocks.activate).toHaveBeenCalledWith(account('max'));
    expect(mocks.go).toHaveBeenCalledWith('addKids');
  });

  it('asks the admin’s PIN first, and goes on to the form after it', () => {
    entry().addKids(account('max', { hasPin: true }));

    expect(mocks.go).toHaveBeenCalledWith('pin', {
      account: account('max', { hasPin: true }),
      next: 'addKids',
    });
    expect(mocks.activate).not.toHaveBeenCalled();
  });
});
