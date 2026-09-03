import { z } from 'zod';
import { NotificationId } from './ids';

export const NotificationCategory = z.enum(['requests', 'media', 'reports', 'downloads', 'system']);
export type NotificationCategory = z.infer<typeof NotificationCategory>;

/** The events the server names today. It owns this vocabulary and grows it, so
 * the wire field is an open string: a client built before an addition must still
 * render the row. */
export const KnownNotificationEvent = z.enum([
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
  'system.disk.low',
  'system.test',
  'custom',
]);

export type KnownNotificationEvent = z.infer<typeof KnownNotificationEvent>;
export const KNOWN_NOTIFICATION_EVENTS = KnownNotificationEvent.options;

/** A known event, or any string a newer server sends. */
export type NotificationEvent = KnownNotificationEvent | (string & {});

/** `link` navigates to an in-app route; `api` calls the server from the row. */
export const ActionKind = z.enum(['link', 'api']);
export type ActionKind = z.infer<typeof ActionKind>;

export const ActionStyle = z.enum(['default', 'primary', 'danger']);
export type ActionStyle = z.infer<typeof ActionStyle>;

export const NotificationAction = z.object({
  id: z.string(),
  label: z.string(),
  kind: ActionKind,
  href: z.string(),
  method: z.string().optional(),
  style: ActionStyle.default('default'),
});
export type NotificationAction = z.infer<typeof NotificationAction>;

export const Notification = z.object({
  id: NotificationId,
  category: NotificationCategory,
  event: z.string(),
  title: z.string(),
  body: z.string(),
  link: z.string().optional(),
  imageUrl: z.string().optional(),
  actions: z.array(NotificationAction).default([]),
  read: z.boolean(),
  createdAt: z.number(),
});
export type Notification = z.infer<typeof Notification>;

/** `GET /api/notifications`. */
export const NotificationsView = z.object({
  notifications: z.array(Notification),
  unread: z.number(),
});
export type NotificationsView = z.infer<typeof NotificationsView>;

export const CategoryPref = z.object({
  category: NotificationCategory,
  inApp: z.boolean(),
  push: z.boolean(),
});
export type CategoryPref = z.infer<typeof CategoryPref>;

/** `GET`/`PUT /api/notifications/prefs`. */
export const NotificationPrefs = z.object({ categories: z.array(CategoryPref) });
export type NotificationPrefs = z.infer<typeof NotificationPrefs>;

/**
 * How a push subscription reaches its device. `webpush` signs with the server's
 * own VAPID key; `relay` carries a push.kroma.tv grant instead of a device token,
 * because Apple and Google only accept credentials issued to the app's publisher;
 * `apns` / `fcm` carry a raw device token and need those publisher credentials.
 */
export const PushTransport = z.enum(['webpush', 'relay', 'apns', 'fcm']);
export type PushTransport = z.infer<typeof PushTransport>;

/** `POST /api/push/subscribe`. Web Push sends `endpoint` plus both keys; the
 * native transports send the device token (or relay grant) as `endpoint` and
 * omit the keys. */
export const SubscribeBody = z.object({
  transport: PushTransport,
  endpoint: z.string(),
  p256dh: z.string().optional(),
  auth: z.string().optional(),
  device: z.string().optional(),
});
export type SubscribeBody = z.infer<typeof SubscribeBody>;

/** Who the console is addressing when it sends a notification by hand. */
export const NotificationTarget = z.enum(['me', 'admins', 'everyone']);
export type NotificationTarget = z.infer<typeof NotificationTarget>;

/** `POST /api/admin/notifications` body: either a core `event` to sample or
 * hand-written text; a `title` wins. */
export const SendNotificationBody = Notification.pick({
  title: true,
  body: true,
  category: true,
  link: true,
  imageUrl: true,
})
  .exactPartial()
  .extend({ event: z.string().optional(), target: NotificationTarget.optional() });
export type SendNotificationBody = z.infer<typeof SendNotificationBody>;

/** One image previously uploaded for a notification. `uploadedAt` is epoch
 * milliseconds of the stored file's mtime. */
export const NotificationImage = z.object({
  name: z.string(),
  url: z.string(),
  uploadedAt: z.number(),
  bytes: z.number(),
});
export type NotificationImage = z.infer<typeof NotificationImage>;

/** `GET /api/admin/notifications/images` newest first, capped server-side. */
export const NotificationImages = z.object({ images: z.array(NotificationImage) });
export type NotificationImages = z.infer<typeof NotificationImages>;
