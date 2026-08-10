import { describe, expect, it } from 'vitest';
import type { RequestContext } from './base';
import {
  deleteNotification,
  getNotificationPrefs,
  listNotifications,
  markAllRead,
  markRead,
  pushKey,
  runNotificationAction,
  setNotificationPrefs,
  subscribePush,
  testPush,
  unsubscribePush,
} from './notifications';

function recordCtx() {
  const calls: { path: string; init?: RequestInit }[] = [];
  const ctx = {
    baseUrl: 'http://nas',
    json: async (path: string, init?: RequestInit) => {
      calls.push({ path, init });
      return {} as never;
    },
  } as unknown as RequestContext;
  return { ctx, calls };
}

const body = (init?: RequestInit) => JSON.parse(init?.body as string);

describe('the notification centre', () => {
  it('reads the account list and the per-category prefs', () => {
    const { ctx, calls } = recordCtx();
    void listNotifications(ctx);
    void getNotificationPrefs(ctx);
    expect(calls.map((c) => c.path)).toEqual(['/notifications', '/notifications/prefs']);
    expect(calls.every((c) => c.init === undefined)).toBe(true);
  });

  it('sends the ids to mark, and an empty body for "all"', () => {
    const { ctx, calls } = recordCtx();
    void markRead(ctx, ['n1', 'n2']);
    void markAllRead(ctx);
    expect(calls[0]).toMatchObject({ path: '/notifications/read', init: { method: 'POST' } });
    expect(body(calls[0]?.init)).toEqual({ ids: ['n1', 'n2'] });
    expect(body(calls[1]?.init)).toEqual({});
  });

  it('encodes the id it deletes', () => {
    const { ctx, calls } = recordCtx();
    void deleteNotification(ctx, 'n 1/2');
    expect(calls[0]).toMatchObject({
      path: '/notifications/n%201%2F2',
      init: { method: 'DELETE' },
    });
  });

  it('PUTs the whole delivery matrix back', () => {
    const { ctx, calls } = recordCtx();
    const prefs = { requests: { push: true, inApp: false } } as never;
    void setNotificationPrefs(ctx, prefs);
    expect(calls[0]).toMatchObject({ path: '/notifications/prefs', init: { method: 'PUT' } });
    expect(body(calls[0]?.init)).toEqual(prefs);
  });
});

describe('web push registration', () => {
  it('reads the VAPID key without a body', () => {
    const { ctx, calls } = recordCtx();
    void pushKey(ctx);
    expect(calls[0]).toEqual({ path: '/push/key', init: undefined });
  });

  it('registers and unregisters the same endpoint on one route', () => {
    const { ctx, calls } = recordCtx();
    const subscription = { endpoint: 'https://push/e', keys: { p256dh: 'k', auth: 'a' } } as never;
    void subscribePush(ctx, subscription);
    void unsubscribePush(ctx, 'https://push/e');
    expect(calls[0]).toMatchObject({ path: '/push/subscribe', init: { method: 'POST' } });
    expect(body(calls[0]?.init)).toEqual(subscription);
    expect(calls[1]).toMatchObject({ path: '/push/subscribe', init: { method: 'DELETE' } });
    expect(body(calls[1]?.init)).toEqual({ endpoint: 'https://push/e' });
  });

  it('fires a test notification with no body', () => {
    const { ctx, calls } = recordCtx();
    void testPush(ctx);
    expect(calls[0]).toEqual({ path: '/push/test', init: { method: 'POST' } });
  });
});

describe('runNotificationAction', () => {
  it('strips the /api prefix the RequestContext adds back', () => {
    const { ctx, calls } = recordCtx();
    void runNotificationAction(ctx, { href: '/api/requests/r1/approve', method: 'PATCH' });
    expect(calls[0]).toEqual({
      path: '/requests/r1/approve',
      init: { method: 'PATCH' },
    });
  });

  it('defaults an action with no method to POST', () => {
    const { ctx, calls } = recordCtx();
    void runNotificationAction(ctx, { href: '/api/requests/r1/deny' });
    expect(calls[0]?.init?.method).toBe('POST');
  });

  it('strips only the leading /api, not one in the middle', () => {
    const { ctx, calls } = recordCtx();
    void runNotificationAction(ctx, { href: '/api/module/tv.kroma.vpn/api/reconnect' });
    expect(calls[0]?.path).toBe('/module/tv.kroma.vpn/api/reconnect');
  });
});
