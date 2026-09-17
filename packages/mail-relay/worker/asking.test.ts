import { beforeEach, describe, expect, it } from 'vitest';
import { Consents, consentBlob, openPending } from './consent';
import worker from './index';
import {
  ADDRESS,
  deny,
  get,
  ORIGIN,
  PUBLIC_URL,
  pendingFor,
  post,
  registered,
  SECRET,
  type Server,
  signed,
  testEnv,
} from './test-support';

let env: ReturnType<typeof testEnv>;
let server: Server;

beforeEach(async () => {
  env = testEnv();
  server = await registered();
});

const ask = async (payload: Record<string, unknown> = { to: ADDRESS, token: 'tok-1234567890' }) =>
  worker.fetch(post('/v1/consent', await signed(server, payload)), env);

describe('asking a mailbox', () => {
  it('mints a link bound to the mailbox, the instance’s origin and the token', async () => {
    const res = await ask();

    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    const blob = consentBlob(PUBLIC_URL, url) ?? '';
    expect(await openPending(SECRET, blob, Math.floor(Date.now() / 1000))).toMatchObject({
      a: ADDRESS,
      o: ORIGIN,
      t: 'tok-1234567890',
    });
    expect(env.sent).toHaveLength(0);
  });

  it('gives a mailbox a small daily budget of questions, whoever asks', async () => {
    for (let i = 0; i < 3; i++) expect((await ask()).status).toBe(200);

    expect((await ask()).status).toBe(429);
    const other = await registered('https://other.example');
    const res = await worker.fetch(
      post('/v1/consent', await signed(other, { to: ADDRESS, token: 'tok-1234567890' })),
      env,
    );
    expect(res.status).toBe(429);
  });

  it('gives an origin a daily budget of its own', async () => {
    for (let i = 0; i < 50; i++) {
      expect((await ask({ to: `r${i}@example.test`, token: 'tok-1234567890' })).status).toBe(200);
    }

    expect((await ask({ to: 'r50@example.test', token: 'tok-1234567890' })).status).toBe(429);
  });

  it('refuses an unsigned, mis-signed or stale request', async () => {
    const good = await signed(server, { to: ADDRESS, token: 'tok-1234567890' });

    expect(
      (await worker.fetch(post('/v1/consent', { ...good, signature: 'x'.repeat(86) }), env)).status,
    ).toBe(401);
    expect((await worker.fetch(post('/v1/consent', { to: ADDRESS }), env)).status).toBe(400);
    const stale = await signed(server, { to: ADDRESS, token: 'tok-1234567890', ts: 1 });
    expect((await worker.fetch(post('/v1/consent', stale), env)).status).toBe(400);
    env.ENROL_IP = deny();
    expect((await ask()).status).toBe(429);
  });
});

describe('the consent link', () => {
  it('sends the browser to the server’s own page with the token and the blob', async () => {
    const blob = await pendingFor();

    const res = await worker.fetch(get(`/confirm/${blob}`), env);
    expect(res.status).toBe(303);
    const target = new URL(res.headers.get('location') ?? '');
    expect(target.origin).toBe(ORIGIN);
    expect(target.pathname).toBe('/verify-email');
    expect(target.searchParams.get('token')).toBe('tok-1234567890');
    expect(target.searchParams.get('consent')).toBe(blob);
    expect(await new Consents(env.COUNTERS, env.LIMIT_SECRET).has(ORIGIN, ADDRESS)).toBe(false);
  });

  it('records the yes on the post and sends the browser back to finish the verification', async () => {
    const blob = await pendingFor();

    const res = await worker.fetch(
      new Request(`${PUBLIC_URL}/confirm/${blob}`, { method: 'POST' }),
      env,
    );
    expect(res.status).toBe(303);
    const target = new URL(res.headers.get('location') ?? '');
    expect(target.origin).toBe(ORIGIN);
    expect(target.searchParams.get('token')).toBe('tok-1234567890');
    expect(target.searchParams.get('consent')).toBeNull();
    expect(await new Consents(env.COUNTERS, env.LIMIT_SECRET).has(ORIGIN, ADDRESS)).toBe(true);
  });

  it('is a dead end for junk and for an expired request', async () => {
    const { sealPending } = await import('./consent');
    const expired = await sealPending(SECRET, { a: ADDRESS, o: ORIGIN, t: 'tok', e: 1 });

    for (const bad of ['v1.junk', expired, 'nothing']) {
      expect((await worker.fetch(get(`/confirm/${bad}`), env)).status).toBe(404);
      const res = await worker.fetch(
        new Request(`${PUBLIC_URL}/confirm/${bad}`, { method: 'POST' }),
        env,
      );
      expect(res.status).toBe(404);
      expect(res.headers.get('location')).toBeNull();
    }
  });
});
