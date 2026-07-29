// Where a notification's link goes on a phone.
//
// Kept apart from the hooks so it is what it looks like: a pure string mapping,
// testable without an Expo runtime (`lib/session` pulls in native modules the
// moment it is imported).

/**
 * Translate a server link into this app's route, or `null` when there is no
 * screen for it.
 *
 * Links are written by the server for the web app's routes, and the two clients
 * do not name screens alike: the browser watches at `/watch/:id`, the phone at
 * `/player/:id`; the browser has a console, the phone has none. Anything with no
 * phone equivalent returns null, and the row simply does not navigate rather
 * than pushing a route that would render an error.
 */
export function mobileRoute(link: string | undefined | null): string | null {
  if (!link) return null;
  const [path] = link.split('?');
  if (!path?.startsWith('/')) return null;
  const [, head, id] = path.split('/');
  switch (head) {
    case '':
    case 'films':
    case 'series':
      // The library's front door: the home tab is the phone's version of it.
      return '/';
    case 'movie':
    case 'item':
      return id ? `/item/${id}` : null;
    case 'show':
      return id ? `/show/${id}` : null;
    case 'watch':
      return id ? `/player/${id}` : null;
    case 'downloads':
      return '/downloads';
    // `/admin/*` and `/requests` have no screen on the phone yet: the row stays
    // a message rather than a dead end.
    default:
      return null;
  }
}
