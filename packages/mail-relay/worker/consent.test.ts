import { describe, expect, it } from 'vitest';
import { openGrant, openPending, sealGrant, sealPending } from './consent';
import { ADDRESS, ORIGIN, SECRET } from './test-support';

const NOW = 1_800_000_000;

describe('consent blobs', () => {
  it('a pending request round-trips, and opens as nothing else', async () => {
    const blob = await sealPending(SECRET, {
      a: ADDRESS,
      o: ORIGIN,
      n: 'Home',
      l: 'fr',
      t: 'tok-1234567890',
      e: NOW + 60,
    });

    expect(await openPending(SECRET, blob, NOW)).toMatchObject({ a: ADDRESS, o: ORIGIN, l: 'fr' });
    expect(await openGrant(SECRET, blob, NOW)).toBeNull();
  });

  it('a grant round-trips, and can never stand in for a pending request', async () => {
    const grant = await sealGrant(SECRET, { a: ADDRESS, o: ORIGIN, e: NOW + 60 });

    expect(await openGrant(SECRET, grant, NOW)).toEqual({ a: ADDRESS, o: ORIGIN, e: NOW + 60 });
    expect(await openPending(SECRET, grant, NOW)).toBeNull();
  });

  it('neither reveals the address it carries', async () => {
    const grant = await sealGrant(SECRET, { a: ADDRESS, o: ORIGIN, e: NOW + 60 });

    expect(grant).not.toContain('reader');
    expect(grant).not.toContain('example');
  });

  it('a grant from another secret, or past its time, is no grant', async () => {
    const foreign = await sealGrant('another-secret', { a: ADDRESS, o: ORIGIN, e: NOW + 60 });
    const stale = await sealGrant(SECRET, { a: ADDRESS, o: ORIGIN, e: NOW - 1 });

    expect(await openGrant(SECRET, foreign, NOW)).toBeNull();
    expect(await openGrant(SECRET, stale, NOW)).toBeNull();
  });
});
