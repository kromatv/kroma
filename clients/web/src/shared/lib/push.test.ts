// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pushKey = vi.fn();
const subscribePush = vi.fn();
const unsubscribePush = vi.fn();
vi.mock('#web/shared/lib/api', () => ({
  kromaClient: () => ({ pushKey, subscribePush, unsubscribePush }),
}));

const { disablePush: disable, enablePush: enable } = await import('@kroma/core');
const { pushBlocker, webPush } = await import('./push');
const { bytesToBase64Url } = await import('./base64url');
const { kromaClient } = await import('#web/shared/lib/api');

const enablePush = () => enable(webPush, kromaClient());
const disablePush = () => disable(webPush, kromaClient());
const currentEndpoint = () => webPush.endpoint();

const MAC_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

interface Env {
  ua?: string;
  secure?: boolean;
  hasPush?: boolean;
  permission?: NotificationPermission;
  standalone?: boolean;
  registration?: unknown;
}

const noWindow = Symbol('no window');

function browser(env: Env = {}) {
  const {
    ua = MAC_CHROME,
    secure = true,
    hasPush = true,
    permission = 'default',
    standalone = false,
    registration,
  } = env;

  const requestPermission = vi.fn().mockResolvedValue(permission);
  const register = vi.fn();
  const getRegistration = vi.fn().mockResolvedValue(registration);

  const serviceWorker = { getRegistration, register };
  const nav: Record<string, unknown> = { userAgent: ua, standalone };
  if (hasPush) nav.serviceWorker = serviceWorker;

  vi.stubGlobal('navigator', nav);
  vi.stubGlobal('window', {
    isSecureContext: secure,
    ...(hasPush ? { PushManager: class {} } : {}),
    matchMedia: () => ({ matches: standalone }),
  });
  vi.stubGlobal('Notification', { permission, requestPermission });

  return { requestPermission, register, getRegistration, serviceWorker };
}

function subscription(endpoint = 'https://push.test/abc', keys = true) {
  return {
    endpoint,
    unsubscribe: vi.fn().mockResolvedValue(true),
    getKey: (name: string) =>
      keys ? new Uint8Array([name === 'auth' ? 1 : 2, 3, 4]).buffer : null,
  };
}

function registration(existing: unknown = null) {
  const subscribe = vi.fn();
  return {
    reg: {
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(existing),
        subscribe,
      },
    },
    subscribe,
  };
}

beforeEach(() => {
  pushKey.mockReset().mockResolvedValue({ publicKey: '-_8' });
  subscribePush.mockReset().mockResolvedValue(undefined);
  unsubscribePush.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('why push is unavailable', () => {
  it('is nothing at all on a capable browser', () => {
    browser();
    expect(pushBlocker()).toBeNull();
  });

  it('is unsupported when there is no window to run in', () => {
    vi.stubGlobal('window', undefined as unknown as typeof noWindow);
    expect(pushBlocker()).toBe('unsupported');
  });

  it('is insecure over plain http', () => {
    browser({ secure: false });
    expect(pushBlocker()).toBe('insecure');
  });

  it('tells an iPhone user to install the app rather than to change browser', () => {
    browser({ ua: IPHONE_SAFARI, hasPush: false, standalone: false });
    expect(pushBlocker()).toBe('needs-install');
  });

  it('is unsupported on an installed iOS app that still has no PushManager', () => {
    browser({ ua: IPHONE_SAFARI, hasPush: false, standalone: true });
    expect(pushBlocker()).toBe('unsupported');
  });

  it('is unsupported on a desktop browser without the APIs', () => {
    browser({ ua: MAC_CHROME, hasPush: false });
    expect(pushBlocker()).toBe('unsupported');
  });

  it('is denied once the user has said no', () => {
    browser({ permission: 'denied' });
    expect(pushBlocker()).toBe('denied');
  });
});

describe('the current subscription', () => {
  it('is nothing when push is blocked, without touching the worker', async () => {
    const b = browser({ secure: false });
    expect(await currentEndpoint()).toBeNull();
    expect(b.getRegistration).not.toHaveBeenCalled();
  });

  it('is nothing when the worker was never registered', async () => {
    browser({ registration: undefined });
    expect(await currentEndpoint()).toBeNull();
  });

  it('is the endpoint the browser holds', async () => {
    const { reg } = registration(subscription('https://push.test/here'));
    browser({ registration: reg });
    expect(await currentEndpoint()).toBe('https://push.test/here');
  });
});

describe('turning push on', () => {
  it('refuses with the blocker as the reason, before prompting', async () => {
    const b = browser({ secure: false });
    await expect(enablePush()).rejects.toThrow('insecure');
    expect(b.requestPermission).not.toHaveBeenCalled();
  });

  it('refuses when the user dismisses the prompt', async () => {
    browser({ permission: 'default' });
    await expect(enablePush()).rejects.toThrow('denied');
  });

  it('registers the worker when there is not one yet', async () => {
    const { reg, subscribe } = registration();
    subscribe.mockResolvedValue(subscription());
    const b = browser({ permission: 'granted', registration: undefined });
    b.register.mockResolvedValue(reg);

    await enablePush();
    expect(b.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  it('reuses the worker already registered', async () => {
    const { reg, subscribe } = registration();
    subscribe.mockResolvedValue(subscription());
    const b = browser({ permission: 'granted', registration: reg });

    await enablePush();
    expect(b.register).not.toHaveBeenCalled();
  });

  it('drops a stale subscription before subscribing again', async () => {
    const stale = subscription('https://push.test/old');
    const { reg, subscribe } = registration(stale);
    subscribe.mockResolvedValue(subscription('https://push.test/new'));
    browser({ permission: 'granted', registration: reg });

    await enablePush();
    expect(stale.unsubscribe).toHaveBeenCalled();
    expect(subscribePush).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://push.test/new' }),
    );
  });

  it('subscribes with the server key as bytes, and userVisibleOnly', async () => {
    const { reg, subscribe } = registration();
    subscribe.mockResolvedValue(subscription());
    browser({ permission: 'granted', registration: reg });

    await enablePush();
    const opts = subscribe.mock.calls[0]?.[0];
    expect(opts.userVisibleOnly).toBe(true);
    expect(Array.from(opts.applicationServerKey as Uint8Array)).toEqual([0xfb, 0xff]);
  });

  it('registers the endpoint with both encryption keys and a device label', async () => {
    const { reg, subscribe } = registration();
    subscribe.mockResolvedValue(subscription('https://push.test/abc'));
    browser({ permission: 'granted', registration: reg });

    await enablePush();
    expect(subscribePush).toHaveBeenCalledWith({
      transport: 'webpush',
      endpoint: 'https://push.test/abc',
      p256dh: bytesToBase64Url(new Uint8Array([2, 3, 4])),
      auth: bytesToBase64Url(new Uint8Array([1, 3, 4])),
      device: 'Chrome · macOS',
    });
  });

  it('refuses rather than registering an endpoint the server cannot encrypt for', async () => {
    const { reg, subscribe } = registration();
    subscribe.mockResolvedValue(subscription('https://push.test/abc', false));
    browser({ permission: 'granted', registration: reg });

    await expect(enablePush()).rejects.toThrow('unsupported');
    expect(subscribePush).not.toHaveBeenCalled();
  });
});

describe('the device label', () => {
  const cases: [string, string][] = [
    [MAC_CHROME, 'Chrome · macOS'],
    [IPHONE_SAFARI, 'Safari · iOS'],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 Edg/126',
      'Edge · Windows',
    ],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0', 'Firefox · Linux'],
    [
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36',
      'Chrome · Android',
    ],
    ['some unknown agent', 'Browser'],
  ];

  it.each(cases)('labels %s as %s', async (ua, label) => {
    const { reg, subscribe } = registration();
    subscribe.mockResolvedValue(subscription());
    browser({ ua, permission: 'granted', registration: reg });

    await enablePush();
    expect(subscribePush).toHaveBeenCalledWith(expect.objectContaining({ device: label }));
  });
});

describe('turning push off', () => {
  it('does nothing when this device was never subscribed', async () => {
    const { reg } = registration(null);
    browser({ registration: reg });

    await disablePush();
    expect(unsubscribePush).not.toHaveBeenCalled();
  });

  it('tells the server which endpoint to forget, and unsubscribes locally', async () => {
    const sub = subscription('https://push.test/bye');
    const { reg } = registration(sub);
    browser({ registration: reg });

    await disablePush();
    expect(sub.unsubscribe).toHaveBeenCalled();
    expect(unsubscribePush).toHaveBeenCalledWith('https://push.test/bye');
  });

  it('does nothing when the worker is not registered at all', async () => {
    browser({ registration: undefined });
    await disablePush();
    expect(unsubscribePush).not.toHaveBeenCalled();
  });
});
