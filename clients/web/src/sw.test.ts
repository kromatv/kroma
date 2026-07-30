// The service worker is a classic script, not a module, so these tests evaluate
// it against a fake `self` and drive the listeners it registered. Its payload
// contract is shared with `services/notify/push.rs::payload_of`.
import { standaloneOptions } from '@kroma/bundler/standalone-script';
import { build } from 'esbuild';
import { describe, expect, it, vi } from 'vitest';
import { swScript } from '../sw.build';

type Listener = (event: unknown) => void;

type Shown = { title: string; options: Record<string, unknown> };

interface Harness {
  fire: (type: string, event: unknown) => Promise<void>;
  shown: Shown[];
  fetches: Array<{ url: string; init?: RequestInit }>;
  opened: string[];
  focused: number;
  navigated: string[];
  clients: Array<Record<string, unknown>>;
  setFetch: (impl: (url: string, init?: RequestInit) => Promise<unknown>) => void;
}

// Bundled from source with the same options the build ships, rather than read
// out of public/, where the artefact only exists if somebody ran a build.
const [output] = (await build({ ...standaloneOptions(swScript), outfile: undefined, write: false }))
  .outputFiles;
if (!output) throw new Error('esbuild produced no service worker to test');
const SOURCE = output.text;

function load(clientList: Array<Record<string, unknown>> = []): Harness {
  const listeners = new Map<string, Listener>();
  const shown: Shown[] = [];
  const fetches: Array<{ url: string; init?: RequestInit }> = [];
  const opened: string[] = [];
  const navigated: string[] = [];
  const state = { focused: 0 };
  let fetchImpl: (url: string, init?: RequestInit) => Promise<unknown> = async () => ({ ok: true });

  let pending: Promise<unknown> = Promise.resolve();

  const clients = clientList.map((c) => ({
    ...c,
    focus: async () => {
      state.focused += 1;
    },
    navigate:
      c.navigate ??
      (async (url: string) => {
        navigated.push(url);
      }),
  }));

  const self = {
    location: { origin: 'https://kroma.test' },
    skipWaiting: () => {},
    addEventListener: (type: string, fn: Listener) => listeners.set(type, fn),
    registration: {
      showNotification: async (title: string, options: Record<string, unknown>) => {
        shown.push({ title, options });
      },
    },
    clients: {
      claim: async () => {},
      matchAll: async () => clients,
      openWindow: async (url: string) => {
        opened.push(url);
      },
    },
  };

  const fetchSpy = (url: string, init?: RequestInit) => {
    fetches.push({ url, init });
    return fetchImpl(url, init);
  };

  // eslint-disable-next-line no-new-func
  new Function('self', 'fetch', 'btoa', 'URL', 'Uint8Array', SOURCE)(
    self,
    fetchSpy,
    (s: string) => Buffer.from(s, 'binary').toString('base64'),
    URL,
    Uint8Array,
  );

  return {
    shown,
    fetches,
    opened,
    navigated,
    clients,
    get focused() {
      return state.focused;
    },
    setFetch: (impl) => {
      fetchImpl = impl;
    },
    fire: async (type, event) => {
      const fn = listeners.get(type);
      if (!fn) throw new Error(`the worker never registered a "${type}" listener`);
      const withWaitUntil = {
        ...(event as Record<string, unknown>),
        waitUntil: (p: Promise<unknown>) => {
          pending = p;
        },
      };
      fn(withWaitUntil);
      await pending;
      pending = Promise.resolve();
    },
  } as Harness;
}

function payload(over: Record<string, unknown> = {}) {
  return {
    id: 'n1',
    title: 'Ready to watch',
    body: 'Dune is now in your library.',
    link: '/movie/ab12',
    imageUrl: 'https://img.example/p.jpg',
    actions: [{ id: 'watch', label: 'Watch', kind: 'link', href: '/movie/ab12' }],
    ...over,
  };
}

const pushEvent = (data: unknown) => ({ data: { json: () => data } });

function shownAt(sw: Harness, n = 0): Shown {
  const found = sw.shown[n];
  if (!found) throw new Error(`the worker showed ${sw.shown.length} notifications, wanted #${n}`);
  return found;
}

function fetchAt(sw: Harness, n = 0): { url: string; init?: RequestInit } {
  const found = sw.fetches[n];
  if (!found) throw new Error(`the worker made ${sw.fetches.length} requests, wanted #${n}`);
  return found;
}

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
    // Showing nothing breaches the "must be user-visible" rule that gets a
    // site's push permission revoked.
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
    // An empty `tag` is a tag every push shares, silently overwriting each
    // notification with the next.
    const sw = load();
    await sw.fire('push', pushEvent(payload({ id: '' })));

    expect(shownAt(sw, 0).options.tag).toBeUndefined();
    expect(shownAt(sw, 0).options.renotify).toBe(false);
  });
});

describe('notificationclick', () => {
  const clickEvent = (over: Record<string, unknown> = {}) => {
    const close = vi.fn();
    return {
      event: {
        action: undefined,
        notification: { close, data: { link: '/movie/ab12', actions: [] } },
        ...over,
      },
      close,
    };
  };

  it('opens the linked page and dismisses the notification', async () => {
    const sw = load();
    const { event, close } = clickEvent();
    await sw.fire('notificationclick', event);

    expect(close).toHaveBeenCalled();
    expect(sw.opened).toEqual(['https://kroma.test/movie/ab12']);
  });

  it('reuses a tab that is already open on this origin', async () => {
    const sw = load([{ url: 'https://kroma.test/library' }]);
    await sw.fire('notificationclick', clickEvent().event);

    expect(sw.opened).toEqual([]);
    expect(sw.focused).toBe(1);
    expect(sw.navigated).toEqual(['https://kroma.test/movie/ab12']);
  });

  it('ignores a tab on another origin', async () => {
    const sw = load([{ url: 'https://elsewhere.test/' }]);
    await sw.fire('notificationclick', clickEvent().event);
    expect(sw.opened).toEqual(['https://kroma.test/movie/ab12']);
    expect(sw.focused).toBe(0);
  });

  it('still focuses a tab that cannot be navigated', async () => {
    // Some browsers reject navigate().
    const sw = load([
      {
        url: 'https://kroma.test/library',
        navigate: async () => {
          throw new Error('not supported');
        },
      },
    ]);
    await sw.fire('notificationclick', clickEvent().event);
    expect(sw.focused).toBe(1);
    expect(sw.opened).toEqual([]);
  });

  it('calls the server directly for an api action without opening the app', async () => {
    const sw = load();
    const { event } = clickEvent({
      action: 'approve',
      notification: {
        close: vi.fn(),
        data: {
          link: '/requests',
          actions: [
            { id: 'approve', kind: 'api', href: '/api/requests/r1/approve', method: 'POST' },
          ],
        },
      },
    });
    await sw.fire('notificationclick', event);

    expect(sw.fetches).toHaveLength(1);
    expect(fetchAt(sw, 0).url).toBe('/api/requests/r1/approve');
    expect(fetchAt(sw, 0).init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(sw.opened).toEqual([]);
  });

  it('opens the app when an api action fails, so the user can act by hand', async () => {
    const sw = load();
    sw.setFetch(async () => {
      throw new Error('offline');
    });
    const { event } = clickEvent({
      action: 'approve',
      notification: {
        close: vi.fn(),
        data: {
          link: '/requests',
          actions: [{ id: 'approve', kind: 'api', href: '/api/requests/r1/approve' }],
        },
      },
    });
    await sw.fire('notificationclick', event);

    expect(sw.opened).toEqual(['https://kroma.test/requests']);
  });

  it('navigates to a link action rather than the notification body link', async () => {
    const sw = load();
    const { event } = clickEvent({
      action: 'watch',
      notification: {
        close: vi.fn(),
        data: {
          link: '/requests',
          actions: [{ id: 'watch', kind: 'link', href: '/movie/ab12' }],
        },
      },
    });
    await sw.fire('notificationclick', event);

    expect(sw.opened).toEqual(['https://kroma.test/movie/ab12']);
    expect(sw.fetches).toEqual([]);
  });

  it('falls back to the root when a notification carries no link at all', async () => {
    const sw = load();
    const { event } = clickEvent({ notification: { close: vi.fn(), data: undefined } });
    await sw.fire('notificationclick', event);
    expect(sw.opened).toEqual(['https://kroma.test/']);
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
