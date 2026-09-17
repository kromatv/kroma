import { describe, expect, it } from 'vitest';
import { importPublicKey, openInstance, openSigned, sealInstance, verify } from './identity';
import { keypair, ORIGIN, registered, SECRET, sign, signed } from './test-support';

const NOW = 1_800_000_000;

describe('an instance', () => {
  it('round-trips the origin and the key, and reveals neither', async () => {
    const { publicKey } = await keypair();
    const blob = await sealInstance(SECRET, { o: ORIGIN, k: publicKey, e: NOW + 60 });

    expect(await openInstance(SECRET, blob, NOW)).toEqual({ o: ORIGIN, k: publicKey, e: NOW + 60 });
    expect(blob).not.toContain('kroma.example');
  });

  it('is not a consent link, and a consent link is not an instance', async () => {
    const { publicKey } = await keypair();
    const blob = await sealInstance(SECRET, { o: ORIGIN, k: publicKey, e: NOW + 60 });
    const { openPending, sealPending } = await import('./consent');

    expect(await openPending(SECRET, blob, NOW)).toBeNull();
    const pending = await sealPending(SECRET, { a: 'a@b.co', o: ORIGIN, t: 'tok', e: NOW + 60 });
    expect(await openInstance(SECRET, pending, NOW)).toBeNull();
  });
});

describe('a signature', () => {
  it('holds for the key that made it and for nothing else', async () => {
    const { publicKey, privateKey } = await keypair();
    const key = await importPublicKey(publicKey);
    if (!key) throw new Error('key did not import');
    const sig = await sign(privateKey, 'hello');

    expect(await verify(key, 'hello', sig)).toBe(true);
    expect(await verify(key, 'hello!', sig)).toBe(false);
    const other = await keypair();
    expect(await verify(key, 'hello', await sign(other.privateKey, 'hello'))).toBe(false);
  });

  it('refuses a key that is not a P-256 point', async () => {
    expect(await importPublicKey('A'.repeat(87))).toBeNull();
    expect(await importPublicKey('')).toBeNull();
  });
});

describe('a signed request', () => {
  it('opens to its instance and payload when the instance’s key vouches', async () => {
    const server = await registered();
    const request = await signed(server, { hello: 'world' });

    const opened = await openSigned(SECRET, request, NOW);
    expect(opened?.instance.o).toBe(ORIGIN);
    expect(opened?.payload).toMatchObject({ hello: 'world' });
  });

  it('is nothing when the payload was touched, the key differs, or the instance is foreign', async () => {
    const server = await registered();
    const request = await signed(server, { hello: 'world' });

    expect(
      await openSigned(SECRET, { ...request, payload: `${request.payload} ` }, NOW),
    ).toBeNull();
    const other = await registered();
    expect(await openSigned(SECRET, { ...request, instance: other.instance }, NOW)).toBeNull();
    expect(await openSigned('another-secret', request, NOW)).toBeNull();
    expect(await openSigned(SECRET, { ...request, payload: 'not json' }, NOW)).toBeNull();
  });
});
