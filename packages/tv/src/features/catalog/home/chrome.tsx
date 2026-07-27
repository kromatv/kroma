// The browse chrome: which routes wear the top bar, and which section it lights.
//
// One <TvTopNav> for all of browse, rendered by the outlet instead of by each
// screen (see TvChrome in app/router). That is what lets the nav pill's lens
// travel from the old section to the new one: a bar that is rebuilt per screen
// hands the remote a lens with no previous box, and an arriving lens does not
// animate. It also stops the clock and the avatar from remounting on every
// section change.

import type { TvChrome } from '#tv/app/router';
import { useNav } from '#tv/app/router';
import { type NavKey, TvTopNav } from '#tv/features/catalog/home/TopNav';

/** The routes that show the bar. They also share one focus scope, so keep this
 * to screens that genuinely wear the same chrome. */
const ROUTES = ['home', 'grid', 'genres', 'genre', 'person', 'movie', 'show'] as const;

/** The section the pill lights, per route. The deep screens (a title, a person,
 * one genre) light nothing: they are not a section, and lighting the one you
 * arrived from would claim you are still there. */
function activeSection(route: ReturnType<typeof useNav>['route']): NavKey | undefined {
  if (route.name === 'home') return 'home';
  if (route.name === 'genres') return 'genres';
  if (route.name === 'grid') return route.params.kind;
  return undefined;
}

function BrowseChrome() {
  const { route } = useNav();
  return <TvTopNav active={activeSection(route)} />;
}

export const BROWSE_CHROME: TvChrome = { routes: ROUTES, render: BrowseChrome };
