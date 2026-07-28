// @vitest-environment jsdom
//
// Binding the shared language-preferences hook to the phone's session.
//
// The hook itself belongs to @kroma/core/react, on purpose: "picking a language
// remembers it on the account" has to mean the same thing on the television, the
// phone and the web, and three implementations of that sentence is how they stop
// meaning the same thing. What lives here is the five lines that say what a
// session IS on this client - and those five lines carry two rules the shared
// hook cannot enforce for itself.
//
// The first: a preference is written to the SERVER and mirrored into the local
// user, in that order and both. Mirror only, and the choice is forgotten on the
// next launch. Write only, and the picker still shows the old language until the
// session reloads, so the tap reads as ignored and the user taps again.
//
// The second: `updateUser` must be a no-op when there is no user. This hook is
// mounted by the player's track sheet, which can outlive a sign-out by a frame -
// and spreading a patch onto `null` is a crash on the way out of the screen.

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The shared hook, captured rather than run: what this file owns is the host
 *  object handed to it, not what it does with it. */
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

/** Mount the binding and hand back the host the shared hook was given. */
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
    // The shared hook renders a picker that is disabled rather than empty, and
    // it needs to be told there is nobody signed in.
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
    // The id has to survive: the session is keyed on it, and a user object
    // without one signs the app out.
    expect(session.setUser).toHaveBeenCalledWith({ id: 'u1', audioLang: 'fr' });
  });

  it('lets a later patch win over an earlier one', () => {
    session.user = { id: 'u1', audioLang: 'fr' } as { id: string };
    host().updateUser({ audioLang: 'en' });
    expect(session.setUser).toHaveBeenCalledWith({ id: 'u1', audioLang: 'en' });
  });

  it('does NOTHING when there is no user', () => {
    session.user = null;
    // Mounted by the player's track sheet, which can outlive a sign-out by a
    // frame; spreading onto null is a crash on the way out of the screen.
    expect(() => host().updateUser({ audioLang: 'fr' })).not.toThrow();
    expect(session.setUser).not.toHaveBeenCalled();
  });
});

describe('writing the choice to the account', () => {
  it('sends the patch to the server', async () => {
    await host().updateAccount({ subtitleLang: 'de' });
    // Without this the choice is forgotten at the next launch.
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
    // Mirror only and it is forgotten; write only and the picker shows the old
    // language until the session reloads.
    expect(session.setUser).toHaveBeenCalledOnce();
    expect(session.updateAccount).toHaveBeenCalledOnce();
  });
});
