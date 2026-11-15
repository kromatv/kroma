// How a notification list reads, once: what each preference bucket is called,
// and which day heading a row falls under. A reader should get the same words
// and grouping whichever KROMA client they're looking at; the exhaustive
// `Record`s below make a new category or day heading impossible to add
// without writing its copy.

import type {
  DeliveryStatus,
  Notification,
  NotificationCategory,
} from '@kromatv/client/notifications';
import type { MessageKey } from '@kromatv/i18n';

/** The five preference buckets, named as a reader sees them in their settings. */
export const NOTIFICATION_CATEGORY_LABEL: Record<NotificationCategory, MessageKey> = {
  requests: 'notifications.category.requests',
  media: 'notifications.category.media',
  reports: 'notifications.category.reports',
  downloads: 'notifications.category.downloads',
  system: 'notifications.category.system',
};

/** What became of a push, as a reader sees it. */
export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, MessageKey> = {
  sent: 'notifications.deliverySent',
  failed: 'notifications.deliveryFailed',
  skipped_muted: 'notifications.deliveryMuted',
  throttled: 'notifications.deliveryThrottled',
  gone: 'notifications.deliveryGone',
};

/** The badge tone each outcome wears, so a list of them reads at a glance. */
export const DELIVERY_STATUS_TONE: Record<DeliveryStatus, 'success' | 'danger' | 'neutral'> = {
  sent: 'success',
  failed: 'danger',
  skipped_muted: 'neutral',
  throttled: 'neutral',
  gone: 'danger',
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

/** Calendar days, not elapsed hours: "yesterday" has to mean yesterday at
 * 23:50 too. Stepping back a day through `startOfDay` keeps it right across a
 * DST boundary, where "now minus 24h" is off by an hour. */
export function notificationDayOf(at: number, now: number): NotificationDay {
  const day = startOfDay(at);
  if (day >= startOfDay(now)) {
    return 'today';
  }
  if (day >= startOfDay(now - 86_400_000)) {
    return 'yesterday';
  }
  return 'earlier';
}

/** When a row last had something to say: its latest emission, falling back to
 * when it was written for a server that sends none. */
export function notificationUpdatedAt(item: Notification): number {
  return item.updatedAt ?? item.createdAt;
}

/** Runs of consecutive same-day rows, in the order the server sent them: the
 * list stays newest-first and is never re-sorted underneath the reader. */
export function groupNotificationsByDay(
  items: Notification[],
): { day: NotificationDay; items: Notification[] }[] {
  const now = Date.now();
  const groups: { day: NotificationDay; items: Notification[] }[] = [];
  for (const item of items) {
    const day = notificationDayOf(notificationUpdatedAt(item), now);
    const last = groups.at(-1);
    if (last?.day === day) {
      last.items.push(item);
    } else {
      groups.push({ day, items: [item] });
    }
  }
  return groups;
}
