import { describe, it } from 'vitest';
import { checkEndpoint, type Endpoint } from '../../endpoints.fixture';
import { NotificationId } from './ids';

const notification = NotificationId.parse('n 1');
const PREFS = { categories: [{ category: 'requests' as const, inApp: true, push: false }] };

describe('the notification-centre endpoints', () => {
  it.each<Endpoint>([
    { name: 'list', call: (c) => c.notifications.list(), method: 'GET', path: '/notifications' },
    {
      name: 'markRead',
      call: (c) => c.notifications.markRead([notification]),
      method: 'POST',
      path: '/notifications/read',
      body: { ids: ['n 1'] },
    },
    {
      name: 'markUnread',
      call: (c) => c.notifications.markUnread([notification]),
      method: 'POST',
      path: '/notifications/unread',
      body: { ids: ['n 1'] },
    },
    {
      name: 'markAllRead, which names no row at all',
      call: (c) => c.notifications.markAllRead(),
      method: 'POST',
      path: '/notifications/read',
      body: {},
    },
    {
      name: 'delete',
      call: (c) => c.notifications.delete(notification),
      method: 'DELETE',
      path: '/notifications/n%201',
    },
    {
      name: 'prefs',
      call: (c) => c.notifications.prefs(),
      method: 'GET',
      path: '/notifications/prefs',
    },
    {
      name: 'setPrefs',
      call: (c) => c.notifications.setPrefs(PREFS),
      method: 'PUT',
      path: '/notifications/prefs',
      body: PREFS,
    },
  ])('$name', checkEndpoint);
});

describe('running a notification action', () => {
  it.each<Endpoint>([
    {
      name: 'strips the /api the transport adds back',
      call: (c) => c.notifications.runAction({ href: '/api/requests/r1/approve' }),
      method: 'POST',
      path: '/requests/r1/approve',
    },
    {
      name: 'sends the verb the action names, whatever its case',
      call: (c) => c.notifications.runAction({ href: '/api/requests/r1', method: 'delete' }),
      method: 'DELETE',
      path: '/requests/r1',
    },
    {
      name: 'puts',
      call: (c) => c.notifications.runAction({ href: '/api/requests/r1', method: 'PUT' }),
      method: 'PUT',
      path: '/requests/r1',
    },
    {
      name: 'patches',
      call: (c) => c.notifications.runAction({ href: '/api/requests/r1', method: 'PATCH' }),
      method: 'PATCH',
      path: '/requests/r1',
    },
  ])('$name', checkEndpoint);
});

describe('the push endpoints', () => {
  it.each<Endpoint>([
    { name: 'key', call: (c) => c.notifications.push.key(), method: 'GET', path: '/push/key' },
    {
      name: 'subscribe',
      call: (c) =>
        c.notifications.push.subscribe({ transport: 'webpush', endpoint: 'https://push/x' }),
      method: 'POST',
      path: '/push/subscribe',
      body: { transport: 'webpush', endpoint: 'https://push/x' },
    },
    {
      name: 'unsubscribe',
      call: (c) => c.notifications.push.unsubscribe('https://push/x'),
      method: 'DELETE',
      path: '/push/subscribe',
      body: { endpoint: 'https://push/x' },
    },
    { name: 'test', call: (c) => c.notifications.push.test(), method: 'POST', path: '/push/test' },
  ])('$name', checkEndpoint);
});
