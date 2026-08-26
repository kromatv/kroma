import type { Notification } from '@kroma/core';

// A link this server minted before the catalogue routes were renamed. The link
// is PERSISTED with the notification, so a row written by an older build - or by
// a newer client talking to an older server - still points at a path the route
// tree no longer has, and would land on the catch-all instead of the title.
const RENAMED: Readonly<Record<string, string>> = {
  film: '/movies',
  films: '/movies',
  movie: '/movies',
  serie: '/shows',
  series: '/shows',
  show: '/shows',
  mylist: '/my-list',
  genre: '/genres',
  person: '/people',
};

function current(link: string): string {
  const [, head, ...rest] = link.split('/');
  const moved = RENAMED[head ?? ''];
  return moved ? [moved, ...rest].join('/') : link;
}

/** Where a notification points: its own `link`, else its first `link`-kind
 * action. An `api` action (Approve, Deny) has no destination and is
 * deliberately not offered, since its notification links to the queue where
 * the decision belongs. */
export function notificationLink(notification: Notification): string | undefined {
  const link = notification.link ?? notification.actions.find((a) => a.kind === 'link')?.href;
  return link === undefined ? undefined : current(link);
}
