import type { Notification } from '@kromatv/client/notifications';
import { subjectRoute } from '#web/features/notifications/subject-route';

// A link this server minted before the catalogue routes were renamed. The link
// is PERSISTED with the notification, so a row written by an older build - or by
// a newer client talking to an older server - still points at a path the route
// tree no longer has, and would land on the catch-all instead of the title.
const RENAMED_HEAD: Readonly<Record<string, string>> = {
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

const RENAMED_PATH: Readonly<Record<string, string>> = {
  '/admin/requests': '/admin/monitoring?tab=requests',
};

function current(link: string): string {
  const whole = RENAMED_PATH[link];
  if (whole) return whole;
  const [, head, ...rest] = link.split('/');
  const moved = RENAMED_HEAD[head ?? ''];
  return moved ? [moved, ...rest].join('/') : link;
}

/** Where a notification points: the screen for its subject, else its own
 * `link`, else its first `link`-kind action. An `api` action (Approve, Deny)
 * has no destination and is deliberately not offered, since its notification
 * links to the queue where the decision belongs. */
export function notificationLink(notification: Notification): string | undefined {
  const fromSubject =
    notification.subject && subjectRoute(notification.subject, notification.event);
  if (fromSubject) return fromSubject;
  const link = notification.link ?? notification.actions.find((a) => a.kind === 'link')?.href;
  return link === undefined ? undefined : current(link);
}
