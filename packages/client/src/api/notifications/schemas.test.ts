import { describe, expect, it } from 'vitest';
import { DeliveriesView, NotificationDelivery, NotificationPrefs } from './schemas';

const SENT = {
  id: 'd1',
  notificationId: 'n1',
  deviceId: 'sub-1',
  device: 'Firefox on Mac',
  transport: 'webpush',
  status: 'sent',
  createdAt: 1_800_000_000_000,
};

describe('a delivery record', () => {
  it('reads a reader’s own attempt, which names no account', () => {
    const parsed = NotificationDelivery.parse(SENT);

    expect(parsed.account).toBeUndefined();
    expect(parsed.status).toBe('sent');
  });

  it('reads the admin view, where every attempt names whose device it was', () => {
    const parsed = NotificationDelivery.parse({
      ...SENT,
      status: 'gone',
      account: { id: 'u1', username: 'Ana' },
    });

    expect(parsed.account?.username).toBe('Ana');
  });

  it('keeps an attempt that reached no device at all', () => {
    const parsed = NotificationDelivery.parse({
      id: 'd2',
      transport: 'relay',
      status: 'failed',
      error: 'push service returned 400',
      createdAt: 1,
    });

    expect(parsed.device).toBeUndefined();
    expect(parsed.error).toBe('push service returned 400');
  });

  it('refuses an outcome this build does not know', () => {
    expect(() => NotificationDelivery.parse({ ...SENT, status: 'queued' })).toThrow();
  });

  it('reads an empty view rather than treating it as absent', () => {
    expect(DeliveriesView.parse({ deliveries: [] }).deliveries).toEqual([]);
  });
});

const CATEGORIES = [{ category: 'system', inApp: true, push: true }];

describe('the delivery matrix', () => {
  it('reads every kind with its category, its label and its switches', () => {
    const parsed = NotificationPrefs.parse({
      categories: CATEGORIES,
      types: [
        {
          type: 'tv.kroma.torrents/download.completed',
          category: 'downloads',
          label: 'Téléchargements terminés',
          inApp: true,
          push: false,
        },
      ],
    });

    expect(parsed.types[0]?.label).toBe('Téléchargements terminés');
    expect(parsed.types[0]?.push).toBe(false);
  });

  it('reads a server built before per-type choice as one with no kinds', () => {
    const parsed = NotificationPrefs.parse({ categories: CATEGORIES });

    expect(parsed.types).toEqual([]);
  });
});
