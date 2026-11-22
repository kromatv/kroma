// Which screens a session may be on, and where it goes when it is somewhere it
// may not be. The rules the guard applies (see ./guard) live here, apart from
// the app, so they can be read and tested as policy rather than as an effect.
//
// ACCESS is a `Record<RouteName, …>` on purpose: adding a route to `TvRoutes`
// without saying who may see it is a type error, not a screen that mounts and
// bounces back to home a tick later.

import type { RedirectRule } from '#tv/app/guard';
import type { OwnerState } from '#tv/app/providers/server-owner';
import type { RouteName } from '#tv/app/router';

// `both` covers screens that serve either session (the PIN pad unlocks a
// profile signed out, and the session it opens is signed in before it leaves).
type Access = 'signedOut' | 'signedIn' | 'both';

// The profile picker is the signed-out home; even with no servers yet it shows
// "Ajouter un profil", which opens the wizard (where `connect` lives). So
// `connect` is an auth-flow screen, never a launch screen.
const ACCESS: Record<RouteName, Access> = {
  profiles: 'signedOut',
  addProfile: 'signedOut',
  connect: 'signedOut',
  quick: 'signedOut',
  unowned: 'signedOut',
  deviceSettings: 'signedOut',
  pin: 'both',
  home: 'signedIn',
  grid: 'signedIn',
  genres: 'signedIn',
  genre: 'signedIn',
  search: 'signedIn',
  person: 'signedIn',
  movie: 'signedIn',
  show: 'signedIn',
  discover: 'signedIn',
  player: 'signedIn',
  trailer: 'signedIn',
  report: 'signedIn',
  releases: 'signedIn',
  profileMenu: 'signedIn',
  addKids: 'signedIn',
};

function screensFor(access: Exclude<Access, 'both'>): RouteName[] {
  const names = Object.keys(ACCESS) as RouteName[];
  return names.filter((name) => ACCESS[name] === access || ACCESS[name] === 'both');
}

export const AUTH_SCREENS: readonly RouteName[] = screensFor('signedOut');
export const APP_SCREENS: readonly RouteName[] = screensFor('signedIn');
export const ALL_SCREENS: readonly RouteName[] = Object.keys(ACCESS) as RouteName[];

export interface GuardState {
  signedIn: boolean;
}

/** The screens a rule may redirect *to*: both are param-less roots. */
export type GuardTarget = 'profiles' | 'home';

export const GUARD: readonly RedirectRule<GuardState, RouteName, GuardTarget>[] = [
  { when: (s) => !s.signedIn, to: 'profiles', allow: AUTH_SCREENS },
  { when: () => true, to: 'home', allow: APP_SCREENS },
];

export interface OwnerRoad {
  route: RouteName;
  owner: OwnerState;
  profiles: number;
  noticed: boolean;
}

export interface OwnerMove {
  via: 'swap' | 'go';
  to: 'quick' | 'unowned';
}

/**
 * The step a signed-out television takes for the owner state of its server.
 * The notice stands in for the pairing code while the server has no account,
 * and the code comes back when it has one. A television with no profile opens
 * the notice by itself, once, so Back still leads to the picker.
 */
export function ownerMove({ route, owner, profiles, noticed }: OwnerRoad): OwnerMove | null {
  if (route === 'unowned') {
    return owner === 'missing' ? null : { via: 'swap', to: 'quick' };
  }
  if (owner !== 'missing') {
    return null;
  }
  if (route === 'quick') {
    return { via: 'swap', to: 'unowned' };
  }
  const firstRun = route === 'profiles' && profiles === 0 && !noticed;
  return firstRun ? { via: 'go', to: 'unowned' } : null;
}
