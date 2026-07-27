// Runtime schemas for the notification centre. Mirrors the Rust `notifications`
// module (`server/crates/kroma-domain/src/notifications.rs`).
//
// Note what is NOT here: the i18n keys and their params. The server stores keys
// and renders them in the reader's language on the way out, so a client only
// ever sees finished text — including action-button labels.

import { z } from 'zod';
import { NotificationId } from './ids';

/** What a notification is about. Users switch delivery on and off per category. */
export const NotificationCategory = z.enum(['requests', 'media', 'reports', 'downloads', 'system']);
export type NotificationCategory = z.infer<typeof NotificationCategory>;

/** Every category, in the order the settings matrix renders them. */
export const NOTIFICATION_CATEGORIES = NotificationCategory.options;

/** The specific thing that happened. Kept as an enum (not an open union) because
 * the server owns every producer; a client built before a new event simply fails
 * the parse rather than rendering a half-known row. */
export const NotificationEvent = z.enum([
  'request.submitted',
  'request.approved',
  'request.denied',
  'request.available',
  'media.added',
  'media.episode',
  'report.submitted',
  'report.resolved',
  'report.dismissed',
  'download.imported',
  'download.failed',
  'system.job.failed',
  'system.vpn.down',
  'system.disk.low',
]);
export type NotificationEvent = z.infer<typeof NotificationEvent>;

/** `link` navigates to an in-app route; `api` calls the server straight from the
 * row (approve a request without opening the console). */
export const ActionKind = z.enum(['link', 'api']);
export type ActionKind = z.infer<typeof ActionKind>;

export const ActionStyle = z.enum(['default', 'primary', 'danger']);
export type ActionStyle = z.infer<typeof ActionStyle>;

/** One button on a notification, label already rendered in the reader's language. */
export const NotificationAction = z.object({
  /** Stable id, so a handler (including a service worker's `notificationclick`)
   * can tell which button was pressed. */
  id: z.string(),
  label: z.string(),
  kind: ActionKind,
  /** Client route for `link`, API path for `api`. */
  href: z.string(),
  /** HTTP method for `api` actions; absent for links. */
  method: z.string().optional(),
  style: ActionStyle.default('default'),
});
export type NotificationAction = z.infer<typeof NotificationAction>;

/** One notification as a client sees it: fully rendered. */
export const Notification = z.object({
  id: NotificationId,
  category: NotificationCategory,
  event: NotificationEvent,
  title: z.string(),
  body: z.string(),
  /** In-app route a tap opens. */
  link: z.string().optional(),
  /** Poster / backdrop for the row and for a rich push. */
  imageUrl: z.string().optional(),
  actions: z.array(NotificationAction).default([]),
  read: z.boolean(),
  createdAt: z.number(),
});
export type Notification = z.infer<typeof Notification>;

/** `GET /api/notifications`. */
export const NotificationsView = z.object({
  notifications: z.array(Notification),
  /** Drives the bell badge. */
  unread: z.number(),
});
export type NotificationsView = z.infer<typeof NotificationsView>;

/** One row of the per-category delivery matrix. */
export const CategoryPref = z.object({
  category: NotificationCategory,
  inApp: z.boolean(),
  push: z.boolean(),
});
export type CategoryPref = z.infer<typeof CategoryPref>;

/** `GET`/`PUT /api/notifications/prefs`. */
export const NotificationPrefs = z.object({
  categories: z.array(CategoryPref),
});
export type NotificationPrefs = z.infer<typeof NotificationPrefs>;

/** How a push subscription reaches its device. `webpush` is the self-hosted
 * path (the server signs with its own VAPID key); `apns`/`fcm` carry a raw
 * device token. */
export const PushTransport = z.enum(['webpush', 'apns', 'fcm']);
export type PushTransport = z.infer<typeof PushTransport>;
