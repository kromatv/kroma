import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseServiceAccount, resetTokenCache, send } from './fcm';
import { Notification } from './schemas';

async function testRsaKey(): Promise<string> {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const b64 = btoa(String.fromCharCode(...pkcs8));
  return `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----\n`;
}

const NOTIFICATION = Notification.parse({ id: 'n1', title: 'Ready to watch' });

let privateKey: string;
let account: ReturnType<typeof parseServiceAccount>;

function serviceAccountJson(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'service_account',
    project_id: 'kroma-push',
    client_email: 'relay@kroma-push.iam.gserviceaccount.com',
    private_key: privateKey,
    ...over,
  });
}

type Call = { url: string; init: RequestInit };

function stubGoogle(options: {
  tokenStatus?: number;
  tokenBody?: unknown;
  sendStatus?: number;
  sendBody?: string;
}): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).startsWith('https://oauth2.googleapis.com/')) {
        return new Response(JSON.stringify(options.tokenBody ?? { access_token: 'ya29.fake' }), {
          status: options.tokenStatus ?? 200,
        });
      }
      return new Response(options.sendBody ?? '', { status: options.sendStatus ?? 200 });
    }),
  );
  return calls;
}

beforeEach(async () => {
  resetTokenCache();
  privateKey = await testRsaKey();
  account = parseServiceAccount(serviceAccountJson());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseServiceAccount', () => {
  it('keeps the keys Google adds beyond the three the relay needs', () => {
    const parsed = parseServiceAccount(serviceAccountJson({ token_uri: 'https://oauth2/token' }));
    expect(parsed.project_id).toBe('kroma-push');
    expect(parsed).toHaveProperty('token_uri', 'https://oauth2/token');
  });

  it('rejects a service account missing the signing key', () => {
    expect(() =>
      parseServiceAccount(JSON.stringify({ project_id: 'p', client_email: 'e' })),
    ).toThrow();
  });

  it('returns the same object for the same JSON rather than re-parsing', () => {
    const json = serviceAccountJson({ private_key_id: 'kid-1' });
    expect(parseServiceAccount(json)).toBe(parseServiceAccount(json));
  });
});

describe('send', () => {
  it('trades a signed assertion for an access token before addressing the device', async () => {
    const calls = stubGoogle({});
    const delivery = await send(account, 'DEVICE-A', NOTIFICATION, 1_700_000_000);

    expect(delivery).toEqual({ ok: true, gone: false, status: 200 });
    expect(calls[0]?.url).toBe('https://oauth2.googleapis.com/token');
    const form = new URLSearchParams(String(calls[0]?.init.body));
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(form.get('assertion')).toMatch(/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/);

    expect(calls[1]?.url).toBe('https://fcm.googleapis.com/v1/projects/kroma-push/messages:send');
    const headers = calls[1]?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer ya29.fake');
    expect(JSON.parse(String(calls[1]?.init.body))).toMatchObject({
      message: { token: 'DEVICE-A' },
    });
  });

  it('reuses the cached token inside its lifetime and re-mints once it lapses', async () => {
    const calls = stubGoogle({});
    await send(account, 'DEVICE-A', NOTIFICATION, 1_700_000_000);
    await send(account, 'DEVICE-B', NOTIFICATION, 1_700_000_600);
    expect(calls.filter((c) => c.url.includes('oauth2'))).toHaveLength(1);

    await send(account, 'DEVICE-C', NOTIFICATION, 1_700_000_000 + 51 * 60);
    expect(calls.filter((c) => c.url.includes('oauth2'))).toHaveLength(2);
  });

  it('does not lend one service account’s token to another', async () => {
    const calls = stubGoogle({});
    await send(account, 'DEVICE-A', NOTIFICATION, 1_700_000_000);
    const other = parseServiceAccount(
      serviceAccountJson({ client_email: 'other@kroma-push.iam.gserviceaccount.com' }),
    );
    await send(other, 'DEVICE-A', NOTIFICATION, 1_700_000_001);
    expect(calls.filter((c) => c.url.includes('oauth2'))).toHaveLength(2);
  });

  it('throws when the token endpoint refuses, so the relay answers 502 rather than evicting', async () => {
    stubGoogle({ tokenStatus: 401, tokenBody: { error: 'invalid_grant' } });
    await expect(send(account, 'DEVICE-A', NOTIFICATION, 1_700_000_000)).rejects.toThrow(
      /token endpoint returned 401/,
    );
  });

  it('throws when the token endpoint answers 200 with no token', async () => {
    stubGoogle({ tokenBody: {} });
    await expect(send(account, 'DEVICE-A', NOTIFICATION, 1_700_000_000)).rejects.toThrow(
      /no access_token/,
    );
  });

  it('reads 404, 410 and an UNREGISTERED body as a dead device', async () => {
    for (const [status, body] of [
      [404, ''],
      [410, ''],
      [400, '{"error":{"details":[{"errorCode":"UNREGISTERED"}]}}'],
    ] as const) {
      resetTokenCache();
      stubGoogle({ sendStatus: status, sendBody: body });
      const delivery = await send(account, 'DEVICE-A', NOTIFICATION, 1_700_000_000);
      expect(delivery).toMatchObject({ ok: false, gone: true, status });
    }
  });

  it('treats any other rejection as transient and truncates the reason it reports', async () => {
    stubGoogle({ sendStatus: 503, sendBody: 'x'.repeat(500) });
    const delivery = await send(account, 'DEVICE-A', NOTIFICATION, 1_700_000_000);
    expect(delivery.ok).toBe(false);
    expect(delivery.gone).toBe(false);
    expect(delivery.reason).toHaveLength(200);
  });
});
