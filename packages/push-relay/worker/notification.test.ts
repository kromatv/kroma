import { describe, expect, it } from 'vitest';
import { apnsPayload, fcmMessage } from './notification';
import { Notification } from './schemas';

const notification = (over: Record<string, unknown> = {}) =>
  Notification.parse({ id: 'n1', title: 'Ready to watch', ...over });

describe('apnsPayload', () => {
  it('carries the alert, a default sound and mutable-content', () => {
    const payload = apnsPayload(notification({ body: 'Dune is in your library.' }));
    expect(payload.aps).toEqual({
      alert: { title: 'Ready to watch', body: 'Dune is in your library.' },
      sound: 'default',
      'mutable-content': 1,
    });
    expect(payload.id).toBe('n1');
  });

  it('omits every optional field the caller did not send', () => {
    const payload = apnsPayload(notification());
    expect('link' in payload).toBe(false);
    expect('imageUrl' in payload).toBe(false);
    expect('actions' in payload).toBe(false);
    expect(payload.aps).not.toHaveProperty('category');
    expect(payload.aps).not.toHaveProperty('thread-id');
  });

  it('maps threadId onto Apple’s thread-id so episodes group in the shade', () => {
    const payload = apnsPayload(
      notification({ category: 'library', threadId: 'show-42', link: '/show/42' }),
    );
    expect(payload.aps).toMatchObject({ category: 'library', 'thread-id': 'show-42' });
    expect(payload.link).toBe('/show/42');
  });

  it('passes actions through as objects, not as a string', () => {
    const payload = apnsPayload(
      notification({
        imageUrl: 'https://img/1.jpg',
        actions: [{ id: 'play', href: '/api/play' }],
      }),
    );
    expect(payload.imageUrl).toBe('https://img/1.jpg');
    expect(payload.actions).toEqual([{ id: 'play', method: 'POST', href: '/api/play' }]);
  });
});

describe('fcmMessage', () => {
  it('addresses the device token and repeats the alert in `notification`', () => {
    const { message } = fcmMessage(notification({ body: 'b' }), 'DEVICE-A') as {
      message: Record<string, unknown>;
    };
    expect(message.token).toBe('DEVICE-A');
    expect(message.notification).toEqual({ title: 'Ready to watch', body: 'b' });
    expect(message.data).toEqual({ id: 'n1' });
  });

  it('encodes actions as a string, since every FCM data value must be one', () => {
    const { message } = fcmMessage(
      notification({ actions: [{ id: 'play', href: '/api/play' }], link: '/show/42' }),
      'DEVICE-A',
    ) as { message: { data: Record<string, unknown> } };
    expect(typeof message.data.actions).toBe('string');
    expect(JSON.parse(String(message.data.actions))).toEqual([
      { id: 'play', method: 'POST', href: '/api/play' },
    ]);
    expect(message.data.link).toBe('/show/42');
  });

  it('sends the category as the Android channel and as data', () => {
    const { message } = fcmMessage(
      notification({ category: 'library', imageUrl: 'https://img/1.jpg' }),
      'DEVICE-A',
    ) as {
      message: {
        data: Record<string, unknown>;
        notification: Record<string, unknown>;
        android: { notification: { channel_id: string } };
      };
    };
    expect(message.data.category).toBe('library');
    expect(message.android.notification.channel_id).toBe('library');
    expect(message.notification.image).toBe('https://img/1.jpg');
  });

  it('falls back to the default channel and demotes only a low-urgency push', () => {
    const high = fcmMessage(notification(), 'DEVICE-A') as {
      message: { android: { priority: string; notification: { channel_id: string } } };
    };
    expect(high.message.android.priority).toBe('high');
    expect(high.message.android.notification.channel_id).toBe('default');

    const low = fcmMessage(notification({ urgency: 'low' }), 'DEVICE-A') as {
      message: { android: { priority: string } };
    };
    expect(low.message.android.priority).toBe('normal');
  });

  it('never sets click_action: the app declares no intent-filter to resolve it', () => {
    const { message } = fcmMessage(notification(), 'DEVICE-A') as {
      message: { android: { notification: Record<string, unknown> } };
    };
    expect('click_action' in message.android.notification).toBe(false);
    expect('tag' in message.android.notification).toBe(false);
    expect('collapse_key' in message.android).toBe(false);
  });
});
