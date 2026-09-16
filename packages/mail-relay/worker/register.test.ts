import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openInstance } from './identity';
import worker from './index';
import { budgetKey } from './limits';
import { deny, keypair, ORIGIN, post, SECRET, sign, testEnv } from './test-support';

let env: ReturnType<typeof testEnv>;

beforeEach(() => {
  env = testEnv();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function origin(privateKey: CryptoKey) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const nonce = new URL(String(url)).searchParams.get('nonce') ?? '';
      return new Response(JSON.stringify({ nonce, signature: await sign(privateKey, nonce) }));
    }),
  );
}

describe('registering', () => {
  it('seals the origin and the key into an instance once the origin proves it holds the key', async () => {
    const { publicKey, privateKey } = await keypair();
    origin(privateKey);

    const res = await worker.fetch(post('/v1/register', { origin: ORIGIN, publicKey }), env);
    expect(res.status).toBe(200);
    const { instance } = (await res.json()) as { instance: string };
    expect(await openInstance(SECRET, instance, Math.floor(Date.now() / 1000))).toMatchObject({
      o: ORIGIN,
      k: publicKey,
    });
  });

  it('refuses an origin that cannot answer for the key', async () => {
    const { publicKey } = await keypair();
    const other = await keypair();
    origin(other.privateKey);

    const res = await worker.fetch(post('/v1/register', { origin: ORIGIN, publicKey }), env);
    expect(res.status).toBe(403);
  });

  it('refuses a key that is no key, and a public http origin', async () => {
    const { publicKey } = await keypair();
    const res = await worker.fetch(
      post('/v1/register', { origin: ORIGIN, publicKey: 'A'.repeat(87) }),
      env,
    );
    expect(res.status).toBe(400);

    const http = await worker.fetch(
      post('/v1/register', { origin: 'http://kroma.example', publicKey }),
      env,
    );
    expect(http.status).toBe(400);
  });

  it('shuts out an origin the operator banned', async () => {
    const { publicKey, privateKey } = await keypair();
    origin(privateKey);
    await env.COUNTERS.put(`ban:${await budgetKey(env.LIMIT_SECRET, ORIGIN)}`, '1');

    const res = await worker.fetch(post('/v1/register', { origin: ORIGIN, publicKey }), env);
    expect(res.status).toBe(403);
  });

  it('rate-limits the caller', async () => {
    env.ENROL_IP = deny();
    const { publicKey } = await keypair();

    const res = await worker.fetch(post('/v1/register', { origin: ORIGIN, publicKey }), env);
    expect(res.status).toBe(429);
  });
});
