import type { Notification } from '@kroma/core';
import { describe, expect, it } from 'vitest';
import { notificationLink } from '#web/features/notifications/notification-link';

const at = (over: Partial<Notification>): Notification =>
  ({ id: 'n1', event: 'media.added', title: 't', body: 'b', actions: [], ...over }) as Notification;

describe('notificationLink', () => {
  it('takes the notification own link over an action', () => {
    const one = at({
      link: '/movies/abc',
      actions: [{ kind: 'link', label: 'Voir', href: '/shows/xyz' }],
    } as Partial<Notification>);

    expect(notificationLink(one)).toBe('/movies/abc');
  });

  it('falls back to the first link-kind action', () => {
    const one = at({
      actions: [
        { kind: 'api', label: 'Approuver', href: '/api/x' },
        { kind: 'link', label: 'Voir', href: '/shows/xyz' },
      ],
    } as Partial<Notification>);

    expect(notificationLink(one)).toBe('/shows/xyz');
  });

  it('has no destination when nothing points anywhere', () => {
    expect(notificationLink(at({}))).toBeUndefined();
  });

  // A link is stored WITH the notification, so a row written before the routes
  // were renamed still names a path the tree no longer has.
  it('carries a link this server minted before the rename to where it moved', () => {
    const moved = (link: string) => notificationLink(at({ link }));

    expect(moved('/movie/abc')).toBe('/movies/abc');
    expect(moved('/show/abc')).toBe('/shows/abc');
    expect(moved('/films')).toBe('/movies');
    expect(moved('/series')).toBe('/shows');
    expect(moved('/mylist')).toBe('/my-list');
    expect(moved('/genre/878')).toBe('/genres/878');
    expect(moved('/person/zendaya')).toBe('/people/zendaya');
  });

  it('leaves a path that never moved alone', () => {
    const same = (link: string) => notificationLink(at({ link }));

    expect(same('/movies/abc')).toBe('/movies/abc');
    expect(same('/watch/abc')).toBe('/watch/abc');
    expect(same('/requests')).toBe('/requests');
    expect(same('/admin/jobs')).toBe('/admin/jobs');
  });
});
