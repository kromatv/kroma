import { describe, expect, it } from 'vitest';
import {
  Notification,
  NotificationCategory,
  NotificationPrefs,
  NotificationsView,
} from './notifications';

/** A notification exactly as the Rust side serializes it. */
const wire = {
  id: 'n1',
  category: 'requests',
  event: 'request.available',
  title: 'Ready to watch',
  body: 'Dune is now in your library.',
  link: '/movie/ab12',
  imageUrl: 'https://img/poster.jpg',
  actions: [
    {
      id: 'watch',
      label: 'Watch',
      kind: 'link',
      href: '/movie/ab12',
      style: 'primary',
    },
  ],
  read: false,
  createdAt: 1_700_000_000_000,
};

describe('Notification', () => {
  it('parses the server shape including image, link and actions', () => {
    const n = Notification.parse(wire);
    expect(n.link).toBe('/movie/ab12');
    expect(n.imageUrl).toBe('https://img/poster.jpg');
    expect(n.actions[0]?.kind).toBe('link');
    expect(n.actions[0]?.style).toBe('primary');
  });

  it('treats link, imageUrl and actions as optional', () => {
    // The server omits `link`/`imageUrl` entirely when unset
    // (`skip_serializing_if = "Option::is_none"`), so absent must parse.
    const { link, imageUrl, actions, ...bare } = wire;
    const n = Notification.parse(bare);
    expect(n.link).toBeUndefined();
    expect(n.imageUrl).toBeUndefined();
    expect(n.actions).toEqual([]);
  });

  it('defaults an action style when the server omits it', () => {
    const n = Notification.parse({
      ...wire,
      actions: [{ id: 'view', label: 'View', kind: 'link', href: '/requests' }],
    });
    expect(n.actions[0]?.style).toBe('default');
  });

  it('keeps an api action’s method', () => {
    const n = Notification.parse({
      ...wire,
      actions: [
        {
          id: 'approve',
          label: 'Approve',
          kind: 'api',
          href: '/api/requests/ab12/approve',
          method: 'POST',
          style: 'primary',
        },
      ],
    });
    expect(n.actions[0]?.method).toBe('POST');
  });

  it('accepts an event this client has never heard of', () => {
    // The server owns this vocabulary and grows it (`custom` for module-raised
    // notifications arrived exactly this way). Title and body are already
    // rendered, so an older client can show the row perfectly well — rejecting
    // it would blank the notification centre against a newer server.
    expect(Notification.parse({ ...wire, event: 'custom' }).event).toBe('custom');
    expect(Notification.parse({ ...wire, event: 'request.teleported' }).event).toBe(
      'request.teleported',
    );
  });

  it('still rejects an unknown category, which the UI does switch on', () => {
    // Unlike `event`, category drives the preferences matrix and the grouping,
    // so an unknown one is not renderable and must not slip through.
    expect(() => Notification.parse({ ...wire, category: 'gossip' })).toThrow();
  });

  it('rejects an unknown category', () => {
    expect(() => Notification.parse({ ...wire, category: 'gossip' })).toThrow();
  });
});

describe('NotificationsView', () => {
  it('carries the unread tally that drives the badge', () => {
    const view = NotificationsView.parse({ notifications: [wire], unread: 3 });
    expect(view.unread).toBe(3);
    expect(view.notifications).toHaveLength(1);
  });

  it('parses an empty inbox', () => {
    expect(NotificationsView.parse({ notifications: [], unread: 0 }).unread).toBe(0);
  });
});

describe('NotificationPrefs', () => {
  it('round-trips the full matrix', () => {
    const prefs = NotificationPrefs.parse({
      categories: NotificationCategory.options.map((category) => ({
        category,
        inApp: true,
        push: category !== 'system',
      })),
    });
    expect(prefs.categories).toHaveLength(5);
    expect(prefs.categories.find((c) => c.category === 'system')?.push).toBe(false);
  });

  it('exposes every category the server knows about', () => {
    // Guards the settings matrix against drifting from the Rust
    // `NotificationCategory::ALL`.
    expect(NotificationCategory.options).toEqual([
      'requests',
      'media',
      'reports',
      'downloads',
      'system',
    ]);
  });
});
