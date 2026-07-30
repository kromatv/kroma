import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTokenCache as resetApns } from './apns';
import { resetTokenCache as resetFcm } from './fcm';
import { seal } from './grant';
import type { Env, RateLimit } from './index';
import worker from './index';

// A throwaway P-256 key in the PEM shape a real `.p8` has, minted per run so
// no key material sits in the repo.
async function testP8(): Promise<string> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(pkcs8)));
  return `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----`;
}

const SECRET = 'a-test-sealing-secret-that-is-long-enough';
const allow = (): RateLimit => ({ limit: vi.fn().mockResolvedValue({ success: true }) });
const deny = (): RateLimit => ({ limit: vi.fn().mockResolvedValue({ success: false }) });

let env: Env;

beforeEach(async () => {
  resetApns();
  resetFcm();
  env = {
    GRANT_SECRET: SECRET,
    APNS_KEY_P8: await testP8(),
    APNS_KEY_ID: 'ABC1234567',
    APNS_TEAM_ID: 'TEAM123456',
    APNS_TOPIC: 'tv.kroma.mobile',
    MINT_LIMIT: allow(),
    PUSH_LIMIT: allow(),
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const post = (path: string, body: unknown) =>
  new Request(`https://push.kroma.tv${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const NOTIFICATION = { id: 'n1', title: 'Ready to watch', body: 'Dune is in your library.' };

// Stand in for Apple, capturing what it was sent.
function stubApple(status: number, body = '') {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(body, { status });
    }),
  );
  return calls;
}

describe('minting a grant', () => {
  it('returns a sealed grant the caller cannot read', async () => {
    const res = await worker.fetch(
      post('/v1/grant', { transport: 'apns', token: 'DEVICE-A' }),
      env,
    );
    expect(res.status).toBe(200);
    const { grant, expiresAt } = (await res.json()) as { grant: string; expiresAt: number };
    expect(grant.startsWith('v1.')).toBe(true);
    expect(grant).not.toContain('DEVICE-A');
    expect(expiresAt).toBeGreaterThan(Date.now());
  });

  it('refuses an unknown transport or a missing token', async () => {
    for (const body of [
      { transport: 'carrier-pigeon', token: 'DEVICE-A' },
      { transport: 'apns' },
      { transport: 'apns', token: '   ' },
      { transport: 'apns', token: 'x'.repeat(2000) },
    ]) {
      expect((await worker.fetch(post('/v1/grant', body), env)).status).toBe(400);
    }
  });

  it('rate-limits minting per address', async () => {
    env.MINT_LIMIT = deny();
    const res = await worker.fetch(
      post('/v1/grant', { transport: 'apns', token: 'DEVICE-A' }),
      env,
    );
    expect(res.status).toBe(429);
  });
});

describe('spending a grant', () => {
  it('delivers to the device the grant names, and to no other', async () => {
    const calls = stubApple(200);
    const grant = await seal(SECRET, { t: 'apns', d: 'DEVICE-A', e: 4_000_000_000 });

    const res = await worker.fetch(post('/v1/push', { grant, notification: NOTIFICATION }), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ delivered: true });

    // The device token comes out of the grant, never off the request — a caller
    // has no field with which to name someone else's phone.
    expect(calls[0]?.url).toBe('https://api.push.apple.com/3/device/DEVICE-A');
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers['apns-topic']).toBe('tv.kroma.mobile');
    expect(headers.authorization).toMatch(/^bearer eyJ/);
  });

  it('refuses a forged, expired or absent grant with one indistinguishable answer', async () => {
    stubApple(200);
    const forged = await seal('another-secret-entirely', { t: 'apns', d: 'X', e: 4_000_000_000 });
    const expired = await seal(SECRET, { t: 'apns', d: 'X', e: 1 });
    for (const grant of [forged, expired, 'v1.garbage', '']) {
      const res = await worker.fetch(post('/v1/push', { grant, notification: NOTIFICATION }), env);
      expect([400, 401]).toContain(res.status);
      expect(await res.text()).not.toContain('expired');
    }
    // Nothing reached Apple on any of those paths.
    expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();
  });

  it('rate-limits by device, so re-minting buys no extra budget', async () => {
    stubApple(200);
    env.PUSH_LIMIT = deny();
    const grant = await seal(SECRET, { t: 'apns', d: 'DEVICE-A', e: 4_000_000_000 });
    const res = await worker.fetch(post('/v1/push', { grant, notification: NOTIFICATION }), env);
    expect(res.status).toBe(429);
    expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();
  });

  it('validates the notification instead of forwarding whatever it is given', async () => {
    stubApple(200);
    const grant = await seal(SECRET, { t: 'apns', d: 'DEVICE-A', e: 4_000_000_000 });
    for (const notification of [
      undefined,
      { title: 'no id' },
      { id: 'n1' },
      { id: 'n1', title: 'x', body: 'y'.repeat(5000) },
    ]) {
      const res = await worker.fetch(post('/v1/push', { grant, notification }), env);
      expect(res.status).toBe(400);
    }
  });

  it('retries the other Apple host before believing a token is dead', async () => {
    // A development build's token is BadDeviceToken against production. Trusting
    // that would evict a live phone, which is the single most common APNs
    // misconfiguration.
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(String(url));
        return calls.length === 1
          ? new Response(JSON.stringify({ reason: 'BadDeviceToken' }), { status: 400 })
          : new Response('', { status: 200 });
      }),
    );
    const grant = await seal(SECRET, { t: 'apns', d: 'DEVICE-A', e: 4_000_000_000 });
    const res = await worker.fetch(post('/v1/push', { grant, notification: NOTIFICATION }), env);

    expect(res.status).toBe(200);
    expect(calls).toEqual([
      'https://api.push.apple.com/3/device/DEVICE-A',
      'https://api.sandbox.push.apple.com/3/device/DEVICE-A',
    ]);
  });

  it('reports a genuinely dead device as 410 so the server evicts it', async () => {
    stubApple(410);
    const grant = await seal(SECRET, { t: 'apns', d: 'DEVICE-A', e: 4_000_000_000 });
    const res = await worker.fetch(post('/v1/push', { grant, notification: NOTIFICATION }), env);
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ delivered: false, gone: true });
  });

  it('reports an upstream wobble as a retryable 502, never as a dead device', async () => {
    // A 503 from Apple must not cost the reader their registration.
    stubApple(503);
    const grant = await seal(SECRET, { t: 'apns', d: 'DEVICE-A', e: 4_000_000_000 });
    const res = await worker.fetch(post('/v1/push', { grant, notification: NOTIFICATION }), env);
    expect(res.status).toBe(502);
  });

  it('says so plainly when the relay holds no key for that transport', async () => {
    const grant = await seal(SECRET, { t: 'fcm', d: 'DEVICE-A', e: 4_000_000_000 });
    const res = await worker.fetch(post('/v1/push', { grant, notification: NOTIFICATION }), env);
    expect(res.status).toBe(503);
  });
});

describe('the request surface', () => {
  it('answers /health with which transports are armed', async () => {
    const res = await worker.fetch(new Request('https://push.kroma.tv/health'), env);
    expect(await res.json()).toEqual({ ok: true, apns: true, fcm: false });
  });

  it('offers nothing else, and does not say what it has', async () => {
    expect((await worker.fetch(post('/v1/anything', {}), env)).status).toBe(404);
    // A GET on the push route is 404 rather than 405: a probe learns nothing
    // about which paths exist from the status it gets back.
    expect((await worker.fetch(new Request('https://push.kroma.tv/v1/push'), env)).status).toBe(
      404,
    );
  });

  it('refuses a body too large to be one of ours', async () => {
    const res = await worker.fetch(
      new Request('https://push.kroma.tv/v1/grant', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': '99999' },
        body: JSON.stringify({ transport: 'apns', token: 'x'.repeat(20000) }),
      }),
      env,
    );
    expect(res.status).toBe(413);
  });

  it('names the offending field rather than echoing the request back', async () => {
    const res = await worker.fetch(post('/v1/grant', { transport: 'apns', token: 42 }), env);
    expect(res.status).toBe(400);
    const { error: reason } = (await res.json()) as { error: string };
    expect(reason).toContain('token');
    expect(reason).not.toContain('42');
  });
});
