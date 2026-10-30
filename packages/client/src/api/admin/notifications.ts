import { z } from 'zod';
import type { RequestContext } from '../../core/http';
import {
  DeliveriesView,
  Notification,
  NotificationImages,
  type SendNotificationBody,
} from '../notifications';

const Samples = z.object({ events: z.array(Notification) });
const Delivered = z.object({ delivered: z.number() });
const ImageStored = z.object({ imageUrl: z.string() });

/** The notification console: preview what the server can say, and say it. */
export function adminNotificationsApi(ctx: RequestContext) {
  return {
    /** Rendered server-side so a preview cannot drift from what Send delivers. */
    samples: () => ctx.get('/admin/notifications/samples', Samples),

    /** Sends a real notification through the normal pipeline, so `delivered`
     * counts people actually reached: a muted category is not counted. */
    send: (body: SendNotificationBody) =>
      ctx.post('/admin/notifications', Delivered, { body: { target: 'me', ...body } }),

    /** Stores an image and returns its cached WebP path in the same store
     * avatars use, so every client already resolves it. */
    uploadImage: (file: Blob) => ctx.upload('/admin/notifications/image', file, ImageStored),

    /** Images previously uploaded for notifications, newest first. */
    images: () => ctx.get('/admin/notifications/images', NotificationImages),

    /** Every account's recent push attempts, newest first, each naming whose
     * device it was. No device address is in the answer. */
    deliveries: () => ctx.get('/admin/notifications/deliveries', DeliveriesView),
  };
}
