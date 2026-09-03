import { describe, it } from 'vitest';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';

describe('the notification console endpoints', () => {
  it.each<Endpoint>([
    {
      name: 'samples',
      call: (c) => c.admin.notifications.samples(),
      method: 'GET',
      path: '/admin/notifications/samples',
    },
    {
      name: 'send, addressed to the caller unless the body says otherwise',
      call: (c) => c.admin.notifications.send({ title: 'Hello' }),
      method: 'POST',
      path: '/admin/notifications',
      body: { target: 'me', title: 'Hello' },
    },
    {
      name: 'send to everyone',
      call: (c) => c.admin.notifications.send({ target: 'everyone', event: 'media.added' }),
      method: 'POST',
      path: '/admin/notifications',
      body: { target: 'everyone', event: 'media.added' },
    },
    {
      name: 'uploadImage',
      call: (c) => c.admin.notifications.uploadImage(new Blob(['x'], { type: 'image/png' })),
      method: 'POST',
      path: '/admin/notifications/image',
    },
    {
      name: 'images',
      call: (c) => c.admin.notifications.images(),
      method: 'GET',
      path: '/admin/notifications/images',
    },
  ])('$name', checkEndpoint);
});
