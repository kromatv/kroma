// The worker's payload contract is shared with `services/notify/push.rs::payload_of`.
import { describe, expect, it } from 'vitest';
import { fetchAt, load, payload, pushEvent, shownAt } from '#web/sw.fixture';

describe('push', () => {
  it('shows the notification the server described', async () => {
    const sw = load();
    await sw.fire('push', pushEvent(payload()));

    expect(sw.shown).toHaveLength(1);
    const { title, options } = shownAt(sw);
    expect(title).toBe('Ready to watch');
    expect(options.body).toBe('Dune is now in your library.');
    expect(options.image).toBe('https://img.example/p.jpg');
    expect(options.data).toMatchObject({ link: '/movie/ab12' });
  });

  it('collapses a retried delivery instead of stacking duplicates', async () => {
    const sw = load();
    await sw.fire('push', pushEvent(payload()));
    expect(shownAt(sw, 0).options.tag).toBe('n1');
    expect(shownAt(sw, 0).options.renotify).toBe(true);
  });

  it('still shows something when the payload is missing or unreadable', async () => {
    const sw = load();
    await sw.fire('push', { data: null });
    await sw.fire('push', {
      data: {
        json: () => {
          throw new Error('not json');
        },
      },
    });

    expect(sw.shown).toHaveLength(2);
    expect(shownAt(sw, 0).title).toBe('KROMA');
    expect(shownAt(sw, 1).title).toBe('KROMA');
    expect(shownAt(sw, 0).options.body).toBe('');
  });

  it('shows at most two action buttons', async () => {
    // Chrome shows two; the server orders them most-useful-first, so the tail
    // is dropped rather than the head.
    const sw = load();
    await sw.fire(
      'push',
      pushEvent(
        payload({
          actions: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' },
            { id: 'c', label: 'C' },
          ],
        }),
      ),
    );

    const actions = shownAt(sw, 0).options.actions as Array<{ action: string }>;
    expect(actions.map((a) => a.action)).toEqual(['a', 'b']);
    expect((shownAt(sw, 0).options.data as { actions: unknown[] }).actions).toHaveLength(3);
  });

  it('survives a payload whose actions are not a list', async () => {
    const sw = load();
    await sw.fire('push', pushEvent(payload({ actions: 'not an array' })));
    expect(shownAt(sw, 0).options.actions).toEqual([]);
  });

  it('degrades one bad field instead of losing the whole notification', async () => {
    const sw = load();
    await sw.fire(
      'push',
      pushEvent(payload({ title: 42, body: 'the body survived', imageUrl: { nope: true } })),
    );

    expect(shownAt(sw, 0).title).toBe('KROMA');
    expect(shownAt(sw, 0).options.body).toBe('the body survived');
    expect(shownAt(sw, 0).options.image).toBeUndefined();
  });

  it('does not collapse unrelated notifications under an empty tag', async () => {
    const sw = load();
    await sw.fire('push', pushEvent(payload({ id: '' })));

    expect(shownAt(sw, 0).options.tag).toBeUndefined();
    expect(shownAt(sw, 0).options.renotify).toBe(false);
  });
});

describe('pushsubscriptionchange', () => {
  const key = (bytes: number[]) => () => new Uint8Array(bytes).buffer;

  it('re-registers the rotated subscription with the server', async () => {
    const sw = load();
    await sw.fire('pushsubscriptionchange', {
      newSubscription: {
        endpoint: 'https://push.example/abc',
        getKey: (name: string) =>
          name === 'p256dh' ? new Uint8Array([1, 2, 3]).buffer : new Uint8Array([4, 5]).buffer,
      },
    });

    expect(sw.fetches).toHaveLength(1);
    expect(fetchAt(sw, 0).url).toBe('/api/push/subscribe');
    const body = JSON.parse(String(fetchAt(sw, 0).init?.body));
    expect(body.transport).toBe('webpush');
    expect(body.endpoint).toBe('https://push.example/abc');
    // base64url, not base64: no +, / or = may reach the server.
    expect(body.p256dh).toBe('AQID');
    expect(body.auth).toBe('BAU');
  });

  it('encodes keys as base64url rather than plain base64', async () => {
    // 0xFB 0xFF encodes to "+/8=" in standard base64; the server decodes
    // base64url, so those characters make the key unusable.
    const sw = load();
    await sw.fire('pushsubscriptionchange', {
      newSubscription: {
        endpoint: 'https://push.example/abc',
        getKey: key([0xfb, 0xff, 0xbf]),
      },
    });
    const body = JSON.parse(String(fetchAt(sw, 0).init?.body));
    expect(body.p256dh).not.toMatch(/[+/=]/);
    expect(body.p256dh).toBe('-_-_');
  });

  it('does nothing when there is no new subscription to register', async () => {
    const sw = load();
    await sw.fire('pushsubscriptionchange', { newSubscription: null });
    expect(sw.fetches).toEqual([]);
  });

  it('does nothing when the subscription cannot yield its keys', async () => {
    const sw = load();
    await sw.fire('pushsubscriptionchange', {
      newSubscription: { endpoint: 'https://push.example/abc' },
    });
    expect(sw.fetches).toEqual([]);
  });
});
