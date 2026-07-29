// Tapping a push. The payload parsing is the part worth pinning: the two
// services wrap our fields differently, and getting it wrong turns every action
// button into a dead tap that looks like a server problem.

import { describe, expect, it, vi } from 'vitest';
import { handleTap, pushData } from './taps';

type Notification = Parameters<typeof pushData>[0];

function notification(data: Record<string, unknown>): Notification {
  return { request: { content: { data } } } as unknown as Notification;
}

function response(data: Record<string, unknown>, actionIdentifier: string) {
  return {
    notification: notification(data),
    actionIdentifier,
  } as unknown as Parameters<typeof handleTap>[0];
}

const APPROVE = { id: 'approve', method: 'POST', href: '/api/requests/r1/approve' };

describe('pushData', () => {
  it('reads the fields off an iOS payload', () => {
    const d = pushData(
      notification({
        id: 'n1',
        link: '/movie/ab12',
        category: 'media_available',
        actions: [APPROVE],
      }),
    );
    expect(d.id).toBe('n1');
    expect(d.link).toBe('/movie/ab12');
    expect(d.category).toBe('media_available');
    expect(d.actions).toEqual([APPROVE]);
  });

  it('reads actions that arrived as an encoded string (Android)', () => {
    // Every FCM `data` value must be a string, so the list travels encoded.
    const d = pushData(notification({ id: 'n1', actions: JSON.stringify([APPROVE]) }));
    expect(d.actions).toEqual([APPROVE]);
  });

  it('survives a payload with nothing useful in it', () => {
    expect(pushData(notification({})).actions).toEqual([]);
    expect(pushData(notification({ actions: 'not json' })).actions).toEqual([]);
    expect(pushData(notification({ actions: [{ id: 'x' }] })).actions).toEqual([]);
    expect(pushData(notification({ link: 42 })).link).toBeUndefined();
  });

  it('defaults a missing method rather than dropping the action', () => {
    const d = pushData(notification({ actions: [{ id: 'a', href: '/api/x' }] }));
    expect(d.actions[0]).toEqual({ id: 'a', href: '/api/x', method: 'POST' });
  });
});

describe('handleTap', () => {
  it('runs the matching action and does not navigate', async () => {
    const client = { runNotificationAction: vi.fn().mockResolvedValue(undefined) };
    const route = await handleTap(
      response({ link: '/admin/requests', actions: [APPROVE] }, 'approve'),
      client as never,
    );
    expect(client.runNotificationAction).toHaveBeenCalledWith(APPROVE);
    // Approving from the lock screen must not drag the app to the foreground.
    expect(route).toBeNull();
  });

  it('falls back to opening the app when the action fails', async () => {
    const client = { runNotificationAction: vi.fn().mockRejectedValue(new Error('offline')) };
    const route = await handleTap(
      response({ link: '/movie/ab12', actions: [APPROVE] }, 'approve'),
      client as never,
    );
    // Better to let the user finish by hand than to swallow the tap.
    expect(route).toBe('/item/ab12');
  });

  it('navigates on a body tap, translating the web link', async () => {
    const client = { runNotificationAction: vi.fn() };
    // expo uses this identifier for "the notification itself was tapped".
    const route = await handleTap(
      response(
        { link: '/watch/ef56', actions: [APPROVE] },
        'expo.modules.notifications.actions.DEFAULT',
      ),
      client as never,
    );
    expect(client.runNotificationAction).not.toHaveBeenCalled();
    expect(route).toBe('/player/ef56');
  });

  it('does not navigate when the link has no phone screen', async () => {
    const client = { runNotificationAction: vi.fn() };
    const route = await handleTap(response({ link: '/admin/reports' }, 'default'), client as never);
    expect(route).toBeNull();
  });

  it('ignores an action id the payload does not describe', async () => {
    const client = { runNotificationAction: vi.fn() };
    const route = await handleTap(
      response({ link: '/movie/ab12', actions: [APPROVE] }, 'deny'),
      client as never,
    );
    // No href for `deny` in this payload: open the app rather than guess one.
    expect(client.runNotificationAction).not.toHaveBeenCalled();
    expect(route).toBe('/item/ab12');
  });
});
