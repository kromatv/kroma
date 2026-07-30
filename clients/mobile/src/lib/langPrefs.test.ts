// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useSharedLangPrefs = vi.hoisted(() =>
  vi.fn((host: unknown) => {
    shared.host = host as Host;
    return { audio: null, subtitle: null } as unknown;
  }),
);
const shared = { host: null as Host | null };

interface Host {
  user: { id: string; audioLang?: string | null } | null;
  updateUser(patch: Record<string, unknown>): void;
  updateAccount(patch: Record<string, unknown>): Promise<unknown>;
}

vi.mock('@kroma/core/react', () => ({ useLangPrefs: useSharedLangPrefs }));

const session = vi.hoisted(() => ({
  user: null as { id: string } | null,
  setUser: vi.fn(),
  updateAccount: vi.fn(async () => ({})),
}));

vi.mock('#mobile/lib/session', () => ({
  useSession: () => ({ user: session.user, setUser: session.setUser }),
  useClient: () => ({ updateAccount: session.updateAccount }),
}));

import { useLangPrefs } from './langPrefs';

function host(): Host {
  renderHook(() => useLangPrefs());
  if (!shared.host) throw new Error('the shared hook was never called');
  return shared.host;
}

beforeEach(() => {
  shared.host = null;
  session.user = { id: 'u1' };
  vi.clearAllMocks();
});

describe('what the binding hands the shared hook', () => {
  it('passes this app’s signed-in user through', () => {
    session.user = { id: 'u7' };
    expect(host().user).toEqual({ id: 'u7' });
  });

  it('passes a null user through rather than inventing one', () => {
    session.user = null;
    expect(host().user).toBeNull();
  });

  it('delegates entirely, keeping one implementation across the clients', () => {
    host();
    expect(useSharedLangPrefs).toHaveBeenCalledOnce();
  });
});

describe('mirroring the choice into the local user', () => {
  it('merges the patch instead of replacing the user', () => {
    session.user = { id: 'u1' };
    host().updateUser({ audioLang: 'fr' });
    expect(session.setUser).toHaveBeenCalledWith({ id: 'u1', audioLang: 'fr' });
  });

  it('lets a later patch win over an earlier one', () => {
    session.user = { id: 'u1', audioLang: 'fr' } as { id: string };
    host().updateUser({ audioLang: 'en' });
    expect(session.setUser).toHaveBeenCalledWith({ id: 'u1', audioLang: 'en' });
  });

  it('does NOTHING when there is no user', () => {
    session.user = null;
    // The player's track sheet mounts this hook and can outlive a sign-out by a
    // frame; spreading onto null is a crash on the way out of the screen.
    expect(() => host().updateUser({ audioLang: 'fr' })).not.toThrow();
    expect(session.setUser).not.toHaveBeenCalled();
  });
});

describe('writing the choice to the account', () => {
  it('sends the patch to the server', async () => {
    await host().updateAccount({ subtitleLang: 'de' });
    expect(session.updateAccount).toHaveBeenCalledWith({ subtitleLang: 'de' });
  });

  it('hands the result back, so the caller can await the write', async () => {
    session.updateAccount.mockResolvedValue({ ok: true });
    await expect(host().updateAccount({ subtitleLang: 'de' })).resolves.toEqual({ ok: true });
  });

  it('is separate from the mirror, so one cannot stand in for the other', () => {
    const bound = host();
    bound.updateUser({ audioLang: 'fr' });
    expect(session.updateAccount).not.toHaveBeenCalled();

    void bound.updateAccount({ audioLang: 'fr' });
    expect(session.setUser).toHaveBeenCalledOnce();
    expect(session.updateAccount).toHaveBeenCalledOnce();
  });
});
