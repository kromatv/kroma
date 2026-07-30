// A screen missing from a session's list still mounts and is then replaced by the
// home page on the same tick, so the feature "opens and closes immediately".

import { describe, expect, it } from 'vitest';
import { resolveRedirect } from './guard';
import { ALL_SCREENS, APP_SCREENS, AUTH_SCREENS, GUARD } from './navPolicy';

const signedIn = { signedIn: true };
const signedOut = { signedIn: false };

describe('navigation policy', () => {
  it('lets a signed-in viewer stay on every screen of the app', () => {
    for (const screen of APP_SCREENS) {
      expect(resolveRedirect(GUARD, signedIn, screen)).toBeNull();
    }
  });

  it('keeps the report screen open, the way it reaches every other detail screen', () => {
    expect(resolveRedirect(GUARD, signedIn, 'report')).toBeNull();
  });

  it('sends a signed-in viewer home from an auth-only screen', () => {
    expect(resolveRedirect(GUARD, signedIn, 'connect')).toBe('home');
    expect(resolveRedirect(GUARD, signedIn, 'profiles')).toBe('home');
  });

  it('sends a signed-out viewer to the picker from anything in the app', () => {
    expect(resolveRedirect(GUARD, signedOut, 'report')).toBe('profiles');
    expect(resolveRedirect(GUARD, signedOut, 'player')).toBe('profiles');
  });

  it('lets a signed-out viewer through the whole auth flow', () => {
    for (const screen of AUTH_SCREENS) {
      expect(resolveRedirect(GUARD, signedOut, screen)).toBeNull();
    }
  });

  it('keeps the PIN pad open in both sessions (unlock signed out, set/clear signed in)', () => {
    expect(resolveRedirect(GUARD, signedOut, 'pin')).toBeNull();
    expect(resolveRedirect(GUARD, signedIn, 'pin')).toBeNull();
  });

  it('leaves no screen out of both lists, so nothing is unreachable in every session', () => {
    // Classifying a new route is compiler-enforced; this checks the derivation.
    const reachable = new Set([...AUTH_SCREENS, ...APP_SCREENS]);
    expect([...ALL_SCREENS].sort()).toEqual([...reachable].sort());
  });
});
