// Where a notification's link goes on a phone.
//
// Kept apart from the hooks so it is what it looks like: a pure string mapping,
// testable without an Expo runtime (`lib/session` pulls in native modules the
// moment it is imported).

/**
 * Translates a server link (written for the web app's routes) into this app's
 * route, or `null` when the phone has no matching screen; e.g. `/watch/:id`
 * on the web maps to `/player/:id` here.
 */
export function mobileRoute(link: string | undefined | null): string | null {
  if (!link) return null;
  const [path] = link.split('?');
  if (!path?.startsWith('/')) return null;
  const [, head, id] = path.split('/');
  switch (head) {
    case '':
      return '/';
    case 'movies':
      return id ? `/item/${id}` : '/';
    case 'shows':
      return id ? `/show/${id}` : '/';
    // An older self-hosted server still sends these links.
    case 'films':
    case 'series':
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
