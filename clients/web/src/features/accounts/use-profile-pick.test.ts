// @vitest-environment jsdom
import { type StoredSession, UserId } from '@kromatv/client/accounts';
import { dropKidsProfileAsk, kidsProfileAsked } from '@kromatv/core';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { ProfileChoice } from './profile-picker.component';
import { useProfilePick } from './use-profile-pick.hook';

interface Mocks {
  activate: Mock;
  enter: Mock;
  open: Mock;
}

const mocks: Mocks = vi.hoisted(() => ({ activate: vi.fn(), enter: vi.fn(), open: vi.fn() }));

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({
    client: { accounts: { kids: { open: mocks.open } } },
    accounts: [],
    activate: mocks.activate,
    enter: mocks.enter,
  }),
}));
vi.mock('#web/features/accounts/use-kids-profiles.hook', () => ({
  useKidsProfiles: () => ({ access: 'ana-access', profiles: [] }),
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

function tile(name: string, over: Partial<ProfileChoice> = {}): ProfileChoice {
  return {
    id: UserId.parse(name),
    username: name,
    avatarUrl: null,
    remembered: null,
    locked: false,
    kids: false,
    ...over,
  };
}

function picker() {
  const onStep = vi.fn();
  const { result } = renderHook(() => useProfilePick(onStep));
  return { onStep, pick: result.current.pick, addKids: result.current.addKids };
}

afterEach(() => {
  vi.clearAllMocks();
  dropKidsProfileAsk();
});

describe('pressing a tile on the web picker', () => {
  it('opens a Kids profile the device has not remembered with a member’s access', async () => {
    const opened = { token: 't', accessToken: 'leo-access' };
    mocks.open.mockResolvedValue(opened);
    const { pick } = picker();

    await pick(tile('leo', { kids: true }));

    expect(mocks.open).toHaveBeenCalledWith('ana-access', UserId.parse('leo'));
    expect(mocks.enter).toHaveBeenCalledWith(opened);
  });

  it('enters a remembered profile at once when the server asks nothing more', async () => {
    mocks.activate.mockResolvedValue({ ok: true });
    const { pick, onStep } = picker();

    await pick(tile('ana', { remembered: account('ana') }));

    expect(mocks.activate).toHaveBeenCalledWith(account('ana'));
    expect(onStep).not.toHaveBeenCalled();
  });

  it('asks the PIN of a remembered profile whose server wants one', async () => {
    mocks.activate.mockResolvedValue({ ok: false, needsPin: true });
    const { pick, onStep } = picker();

    await pick(tile('ana', { remembered: account('ana') }));

    expect(onStep).toHaveBeenCalledWith({ kind: 'pin', account: account('ana') });
  });

  it('sends a remembered profile whose access is gone back to sign in', async () => {
    mocks.activate.mockResolvedValue({ ok: false, needsPin: false });
    const { pick, onStep } = picker();

    await pick(tile('ana', { remembered: account('ana') }));

    expect(onStep).toHaveBeenCalledWith({
      kind: 'login',
      user: account('ana').user,
      expired: true,
    });
  });

  it('asks a profile the device does not remember to sign in', async () => {
    const { pick, onStep } = picker();

    await pick(tile('ben'));

    expect(onStep).toHaveBeenCalledWith({
      kind: 'login',
      user: { id: UserId.parse('ben'), username: 'ben', avatarUrl: null, hasPin: false },
    });
  });

  it('enters the admin through the Kids door and asks for the Kids profile form', async () => {
    mocks.activate.mockResolvedValue({ ok: true });
    const { addKids } = picker();

    await addKids(account('max'));

    expect(mocks.activate).toHaveBeenCalledWith(account('max'));
    expect(kidsProfileAsked('max')).toBe(true);
  });
});
