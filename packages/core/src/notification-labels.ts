// How a notification list reads, once: what each preference bucket is called,
// and which day heading a row falls under.
//
// Lives beside `push-labels.ts` for the same reason and on the same argument: a
// reader should get the same words and the same grouping whichever KROMA they
// are looking at, and the exhaustive `Record`s below make a new category or a
// new day heading impossible to add without writing its copy.
//
// The grouping helpers are here rather than in either client because they are
// pure functions of a `Notification` and a clock — no React, no platform. They
// were written twice, identically, comments included; the DST reasoning below is
// exactly the kind of thing that must not exist in two places where only one
// copy gets the fix.

import type { Notification, NotificationCategory } from '@kroma/client';
import type { MessageKey } from './i18n';

/** The five preference buckets, named as a reader sees them in their settings. */
export const NOTIFICATION_CATEGORY_LABEL: Record<NotificationCategory, MessageKey> = {
  requests: 'notifications.category.requests',
  media: 'notifications.category.media',
  reports: 'notifications.category.reports',
  downloads: 'notifications.category.downloads',
  system: 'notifications.category.system',
};

/** Which heading a row sits under. */
export type NotificationDay = 'today' | 'yesterday' | 'earlier';

export const NOTIFICATION_DAY_LABEL: Record<NotificationDay, MessageKey> = {
  today: 'notifications.groupToday',
  yesterday: 'notifications.groupYesterday',
  earlier: 'notifications.groupEarlier',
};

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Calendar days, not elapsed hours — "yesterday" has to mean yesterday at
 * 23:50 too. Stepping back a day through `startOfDay` keeps it right across a
 * DST boundary, where "now minus 24h" is off by an hour. */
export function notificationDayOf(at: number, now: number): NotificationDay {
  const day = startOfDay(at);
  if (day >= startOfDay(now)) return 'today';
  if (day >= startOfDay(now - 86_400_000)) return 'yesterday';
  return 'earlier';
}

/** Runs of consecutive same-day rows, in the order the server sent them: the
 * list stays newest-first and is never re-sorted underneath the reader. */
export function groupNotificationsByDay(
  items: Notification[],
): { day: NotificationDay; items: Notification[] }[] {
  const now = Date.now();
  const groups: { day: NotificationDay; items: Notification[] }[] = [];
  for (const item of items) {
    const day = notificationDayOf(item.createdAt, now);
    const last = groups.at(-1);
    if (last?.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}
