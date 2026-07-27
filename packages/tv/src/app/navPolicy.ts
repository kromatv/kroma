// Which screens a session may be on, and where it goes when it is somewhere it
// may not be. The rules the guard applies (see ./guard) live here, apart from
// the app, so they can be read and tested as policy rather than as an effect.
//
// The point of the ACCESS map is that it is a `Record<RouteName, …>`: adding a
// route to `TvRoutes` without saying who may see it is a TYPE ERROR, not a
// screen that mounts and is bounced back to the home page a tick later. That is
// exactly how the report screen shipped broken once.

import type { RedirectRule } from '#tv/app/guard';
import type { RouteName } from '#tv/app/router';

/** Who a screen is for. `both` covers the screens that serve either session
 * (the PIN pad: unlock a locked profile signed out, set/clear one signed in). */
type Access = 'signedOut' | 'signedIn' | 'both';

/**
 * Every screen, classified. The profile picker is the signed-out home even with
 * no servers yet it shows "Ajouter un profil", which opens the wizard (where
 * `connect` lives). So `connect` is an auth-flow screen, never a launch screen.
 */
const ACCESS: Record<RouteName, Access> = {
  profiles: 'signedOut',
  addProfile: 'signedOut',
  connect: 'signedOut',
  quick: 'signedOut',
  deviceSettings: 'signedOut',
  // Reached from device settings signed out and from the profile menu signed
  // in, and it needs neither: it only reports what this build is.
  about: 'both',
  pin: 'both',
  home: 'signedIn',
  grid: 'signedIn',
  genres: 'signedIn',
  genre: 'signedIn',
  search: 'signedIn',
  person: 'signedIn',
  movie: 'signedIn',
  show: 'signedIn',
  player: 'signedIn',
  report: 'signedIn',
  profileMenu: 'signedIn',
  settingsGroup: 'both',
};

function screensFor(access: Exclude<Access, 'both'>): RouteName[] {
  const names = Object.keys(ACCESS) as RouteName[];
  return names.filter((name) => ACCESS[name] === access || ACCESS[name] === 'both');
}

/** Reachable while signed out. */
export const AUTH_SCREENS: readonly RouteName[] = screensFor('signedOut');
/** Reachable while signed in. */
export const APP_SCREENS: readonly RouteName[] = screensFor('signedIn');
/** Every screen the router knows, classified. */
export const ALL_SCREENS: readonly RouteName[] = Object.keys(ACCESS) as RouteName[];

export interface GuardState {
  signedIn: boolean;
}

/** The screens a rule may redirect *to*: both are param-less roots. */
export type GuardTarget = 'profiles' | 'home';

/** Declarative navigation policy, first match wins: signed out → the picker and
 * the auth flow; signed in → the app. */
export const GUARD: readonly RedirectRule<GuardState, RouteName, GuardTarget>[] = [
  { when: (s) => !s.signedIn, to: 'profiles', allow: AUTH_SCREENS },
  { when: () => true, to: 'home', allow: APP_SCREENS },
];
