// The device's half of the relay contract: what leaves the phone, what is
// kept, and what happens when the network refuses. The security claim is the
// first test's: the raw APNs/FCM token goes to the relay and NOWHERE else;
// everything else here protects the stored grant, the only thing that can
// unregister this device.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('#mobile/lib/storage', () => ({
  loadPref: vi.fn(async (key: string) => store.get(key) ?? null),
  savePref: vi.fn(async (key: string, value: string | null) => {
    if (value === null) store.delete(key);
    else store.set(key, value);
  }),
}));

const { forgetGrant, grantFor, refreshGrant, storedGrant } = await import('./relay');

const DAY = 24 * 60 * 60 * 1000;
// Past the refresh window (30 days), so nothing re-mints unasked.
const FRESH = () => Date.now() + 90 * DAY;
// Inside it.
const EXPIRING = () => Date.now() + 10 * DAY;

function relayAnswers(...grants: { grant: string; expiresAt: number }[]) {
  const fetchMock = vi.fn(async () => {
    const next = grants.shift();
    if (!next) throw new Error('relay called more times than the test allowed');
    return { ok: true, json: async () => next } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// Seed a grant as if a previous launch had registered one.
function stored(grant: string, expiresAt: number, token = 'DEVICE-TOKEN') {
  store.set('push.grant', JSON.stringify({ transport: 'apns', token, grant, expiresAt }));
}

beforeEach(() => {
  store.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('trading a device token for a grant', () => {
  it('sends the token to the relay and hands back only the grant', async () => {
    const fetchMock = relayAnswers({ grant: 'v1.sealed', expiresAt: FRESH() });

    const grant = await grantFor('apns', 'DEVICE-TOKEN');

    expect(grant).toBe('v1.sealed');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://push.kroma.tv/v1/grant');
    expect(JSON.parse(String(init.body))).toEqual({
      transport: 'apns',
      token: 'DEVICE-TOKEN',
    });
    // What a server is given is the capability, never the token behind it.
    expect(grant).not.toContain('DEVICE-TOKEN');
  });

  it('reuses the stored grant rather than minting a second one', async () => {
    // Re-minting would hand the server a different blob for the same device, so
    // the row it already holds could never be unregistered.
    stored('v1.kept', FRESH());
    const fetchMock = relayAnswers();

    expect(await grantFor('apns', 'DEVICE-TOKEN')).toBe('v1.kept');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('re-mints when the token changed under it', async () => {
    // A reinstall or a restore onto another handset: the stored grant points at
    // a device that is no longer this one.
    stored('v1.old', FRESH(), 'OLD-TOKEN');
    relayAnswers({ grant: 'v1.new', expiresAt: FRESH() });

    expect(await grantFor('apns', 'NEW-TOKEN')).toBe('v1.new');
    expect(await storedGrant()).toBe('v1.new');
  });

  it('re-mints when the stored grant is close to expiring', async () => {
    stored('v1.stale', EXPIRING());
    relayAnswers({ grant: 'v1.fresh', expiresAt: FRESH() });

    expect(await grantFor('apns', 'DEVICE-TOKEN')).toBe('v1.fresh');
  });

  it('refuses rather than registering something that will never deliver', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503 }) as unknown as Response),
    );
    await expect(grantFor('apns', 'DEVICE-TOKEN')).rejects.toThrow('503');
    expect(await storedGrant()).toBeNull();
  });

  it('refuses a reply that is not a grant', async () => {
    // A network boundary like any other: the shape is parsed, not trusted.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ nope: true }) }) as unknown as Response),
    );
    await expect(grantFor('fcm', 'DEVICE-TOKEN')).rejects.toThrow();
  });
});

describe('the stored grant', () => {
  it('is what unsubscribing names, and survives being forgotten', async () => {
    relayAnswers({ grant: 'v1.sealed', expiresAt: FRESH() });
    await grantFor('apns', 'DEVICE-TOKEN');
    expect(await storedGrant()).toBe('v1.sealed');

    await forgetGrant();
    expect(await storedGrant()).toBeNull();
  });

  it('reads as nothing when the stored blob is corrupt', async () => {
    // Rather than throwing on launch and taking the push setup down with it.
    store.set('push.grant', '{not json');
    expect(await storedGrant()).toBeNull();
    store.set('push.grant', JSON.stringify({ transport: 'smoke-signal' }));
    expect(await storedGrant()).toBeNull();
  });
});

describe('refreshing a grant that is running out', () => {
  it('does nothing while there is plenty of time left', async () => {
    stored('v1.fine', FRESH());
    const fetchMock = relayAnswers();
    expect(await refreshGrant()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing when this device has never registered', async () => {
    expect(await refreshGrant()).toBeNull();
  });

  it('does NOT adopt the new grant until the caller commits', async () => {
    // Storing the new grant immediately would destroy the only copy of the
    // old one before the server has actually accepted the replacement.
    stored('v1.old', EXPIRING());
    relayAnswers({ grant: 'v1.new', expiresAt: FRESH() });

    const refresh = await refreshGrant();
    expect(refresh).not.toBeNull();
    expect(refresh?.grant).toBe('v1.new');
    // ...and the old one is named, so the row it left behind can be retired.
    expect(refresh?.previous).toBe('v1.old');
    // Still the old one, because the server has not accepted anything yet.
    expect(await storedGrant()).toBe('v1.old');

    await refresh?.commit();
    expect(await storedGrant()).toBe('v1.new');
  });

  it('leaves the working grant in place when the relay is unreachable', async () => {
    stored('v1.old', EXPIRING());
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    await expect(refreshGrant()).rejects.toThrow('offline');
    expect(await storedGrant()).toBe('v1.old');
  });
});
