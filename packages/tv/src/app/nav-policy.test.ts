// A screen missing from a session's list still mounts and is then replaced by the
// home page on the same tick, so the feature "opens and closes immediately".

import { describe, expect, it } from 'vitest';
import { resolveRedirect } from './guard';
import {
  ALL_SCREENS,
  APP_SCREENS,
  AUTH_SCREENS,
  GUARD,
  type OwnerRoad,
  ownerMove,
} from './nav-policy';

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

describe('the road of a server with no account', () => {
  const firstRun: OwnerRoad = { route: 'profiles', owner: 'missing', profiles: 0, noticed: false };

  it('opens the notice by itself on a television with no profile', () => {
    expect(ownerMove(firstRun)).toEqual({ via: 'go', to: 'unowned' });
  });

  it('opens it once, so Back from the notice stays on the picker', () => {
    expect(ownerMove({ ...firstRun, noticed: true })).toBeNull();
  });

  it('leaves the picker alone when it has a profile to offer', () => {
    expect(ownerMove({ ...firstRun, profiles: 1 })).toBeNull();
  });

  it('puts the notice in place of the pairing code', () => {
    expect(ownerMove({ ...firstRun, route: 'quick', profiles: 1 })).toEqual({
      via: 'swap',
      to: 'unowned',
    });
  });

  it('keeps the notice for as long as the server has no account', () => {
    expect(ownerMove({ ...firstRun, route: 'unowned', noticed: true })).toBeNull();
  });

  it('brings the pairing code back once the server reports an account', () => {
    expect(ownerMove({ ...firstRun, route: 'unowned', owner: 'present' })).toEqual({
      via: 'swap',
      to: 'quick',
    });
  });

  it('never shows the notice for a server that did not answer', () => {
    expect(ownerMove({ ...firstRun, owner: 'unknown' })).toBeNull();
    expect(ownerMove({ ...firstRun, route: 'quick', owner: 'unknown' })).toBeNull();
  });

  it('waits for the first answer before it moves', () => {
    expect(ownerMove({ ...firstRun, owner: 'checking' })).toBeNull();
    expect(ownerMove({ ...firstRun, route: 'quick', owner: 'checking' })).toBeNull();
  });

  it('touches no other screen of the sign-in flow', () => {
    expect(ownerMove({ ...firstRun, route: 'addProfile' })).toBeNull();
    expect(ownerMove({ ...firstRun, route: 'connect' })).toBeNull();
  });
});
