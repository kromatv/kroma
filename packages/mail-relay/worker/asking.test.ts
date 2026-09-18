import { beforeEach, describe, expect, it } from 'vitest';
import { activationBlob, openPending, sealBlock, sealPending } from './activation';
import worker from './index';
import {
  ADDRESS,
  deny,
  get,
  marks,
  ORIGIN,
  OWNER,
  PUBLIC_URL,
  pendingFor,
  post,
  registered,
  SECRET,
  SERVER_IP,
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

const ask = async (payload: Record<string, unknown> = { to: OWNER, token: 'tok-1234567890' }) =>
  worker.fetch(
    post('/v1/activate', await signed(server, payload), { 'cf-connecting-ip': SERVER_IP }),
    env,
  );

const postTo = (path: string) => new Request(`${PUBLIC_URL}${path}`, { method: 'POST' });

describe('asking to be activated', () => {
  it('mints a link bound to the mailbox, the origin, the caller’s address and the token', async () => {
    const res = await ask();

    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    const blob = activationBlob(PUBLIC_URL, url) ?? '';
    expect(await openPending(SECRET, blob, Math.floor(Date.now() / 1000))).toMatchObject({
      a: OWNER,
      o: ORIGIN,
      t: 'tok-1234567890',
      i: SERVER_IP,
    });
    expect(env.sent).toHaveLength(0);
  });

  it('gives a mailbox a small daily budget of questions, whoever asks', async () => {
    for (let i = 0; i < 3; i++) expect((await ask()).status).toBe(200);

    expect((await ask()).status).toBe(429);
    const other = await registered('https://other.example');
    const res = await worker.fetch(
      post('/v1/activate', await signed(other, { to: OWNER, token: 'tok-1234567890' })),
      env,
    );
    expect(res.status).toBe(429);
  });

  it('gives an origin a daily budget of its own', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await ask({ to: `r${i}@example.test`, token: 'tok-1234567890' })).status).toBe(200);
    }

    expect((await ask({ to: 'r5@example.test', token: 'tok-1234567890' })).status).toBe(429);
  });

  it('refuses an unsigned, mis-signed or stale request', async () => {
    const good = await signed(server, { to: OWNER, token: 'tok-1234567890' });

    expect(
      (await worker.fetch(post('/v1/activate', { ...good, signature: 'x'.repeat(86) }), env))
        .status,
    ).toBe(401);
    expect((await worker.fetch(post('/v1/activate', { to: OWNER }), env)).status).toBe(400);
    const stale = await signed(server, { to: OWNER, token: 'tok-1234567890', ts: 1 });
    expect((await worker.fetch(post('/v1/activate', stale), env)).status).toBe(400);
    env.ENROL_IP = deny();
    expect((await ask()).status).toBe(429);
  });
});

describe('the activation link', () => {
  it('sends the browser to the server’s page with the token, the blob and the caller’s address', async () => {
    const blob = await pendingFor();

    const res = await worker.fetch(get(`/confirm/${blob}`), env);
    expect(res.status).toBe(303);
    const target = new URL(res.headers.get('location') ?? '');
    expect(target.origin).toBe(ORIGIN);
    expect(target.pathname).toBe('/verify-email');
    expect(target.searchParams.get('token')).toBe('tok-1234567890');
    expect(target.searchParams.get('activate')).toBe(blob);
    expect(target.searchParams.get('ip')).toBe(SERVER_IP);
    expect(await marks(env).active(ORIGIN)).toBe(false);
  });

  it('activates the server on the post and sends the browser back to finish the verification', async () => {
    const blob = await pendingFor();

    const res = await worker.fetch(postTo(`/confirm/${blob}`), env);
    expect(res.status).toBe(303);
    const target = new URL(res.headers.get('location') ?? '');
    expect(target.origin).toBe(ORIGIN);
    expect(target.searchParams.get('token')).toBe('tok-1234567890');
    expect(target.searchParams.get('activate')).toBeNull();
    expect(await marks(env).active(ORIGIN)).toBe(true);
  });

  it('is a dead end for junk and for an expired request', async () => {
    const expired = await sealPending(SECRET, { a: OWNER, o: ORIGIN, t: 'tok', i: '', e: 1 });

    for (const bad of ['v1.junk', expired, 'nothing']) {
      expect((await worker.fetch(get(`/confirm/${bad}`), env)).status).toBe(404);
      const res = await worker.fetch(postTo(`/confirm/${bad}`), env);
      expect(res.status).toBe(404);
      expect(res.headers.get('location')).toBeNull();
    }
  });
});

describe('the opt-out link', () => {
  const now = () => Math.floor(Date.now() / 1000);

  it('shows the server’s host and a button, and blocks nothing until it is pressed', async () => {
    const blob = await sealBlock(SECRET, ADDRESS, ORIGIN, now());

    const res = await worker.fetch(get(`/block/${blob}`), env);
    expect(res.status).toBe(200);
    const page = await res.text();
    expect(page).toContain('kroma.example');
    expect(page).toContain('<form method="post">');
    expect(await marks(env).blocked(ORIGIN, ADDRESS)).toBe(false);
  });

  it('blocks the mailbox for that server on the post, and no other', async () => {
    await marks(env).activate(ORIGIN, OWNER);
    const blob = await sealBlock(SECRET, ADDRESS, ORIGIN, now());

    const res = await worker.fetch(postTo(`/block/${blob}`), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('kroma.example');
    expect(await marks(env).blocked(ORIGIN, ADDRESS)).toBe(true);
    expect(await marks(env).blocked('https://other.example', ADDRESS)).toBe(false);
    expect(await marks(env).active(ORIGIN)).toBe(true);
  });

  it('takes the activation away when the mailbox is the one that gave it', async () => {
    await marks(env).activate(ORIGIN, OWNER);
    const blob = await sealBlock(SECRET, OWNER, ORIGIN, now());

    await worker.fetch(postTo(`/block/${blob}`), env);
    expect(await marks(env).active(ORIGIN)).toBe(false);
  });

  it('is a dead end for junk, and for an activation blob', async () => {
    for (const bad of ['v1.junk', await pendingFor(), 'nothing']) {
      expect((await worker.fetch(get(`/block/${bad}`), env)).status).toBe(404);
      expect((await worker.fetch(postTo(`/block/${bad}`), env)).status).toBe(404);
    }
  });
});
