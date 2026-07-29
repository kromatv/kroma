import { describe, expect, it } from 'vitest';
import { deviceKey, GRANT_TTL_SECS, open, seal } from './grant';
import { b64url, fromB64url } from './jwt';

const SECRET = 'a-test-sealing-secret-that-is-long-enough';
const NOW = 1_800_000_000;

/** Mirrors the IV width `grant.ts` prepends to the sealed bytes. */
const IV_BYTES = 12;

const grantFor = (token: string, exp = NOW + GRANT_TTL_SECS) =>
  seal(SECRET, { t: 'apns', d: token, e: exp });

/** The sealed half of `v1.<blob>`. */
const blobOf = (grant: string): string => grant.split('.')[1] ?? '';

describe('grants', () => {
  it('round-trips exactly what was sealed', async () => {
    const grant = await grantFor('DEVICE-TOKEN-A');
    const opened = await open(SECRET, grant, NOW);
    expect(opened).toEqual({ t: 'apns', d: 'DEVICE-TOKEN-A', e: NOW + GRANT_TTL_SECS });
  });

  it('hides the device token it carries', async () => {
    // The point of sealing rather than signing: a self-hosted server stores this
    // string, so a leaked server database must not be a pile of push tokens.
    const grant = await grantFor('DEVICE-TOKEN-A');
    expect(grant).not.toContain('DEVICE-TOKEN-A');
    expect(atob(blobOf(grant).replace(/-/g, '+').replace(/_/g, '/'))).not.toContain('DEVICE');
  });

  it('never mints the same blob twice for the same device', async () => {
    // A repeated IV under AES-GCM is a key-recovery bug, so this is load-bearing.
    const a = await grantFor('DEVICE-TOKEN-A');
    const b = await grantFor('DEVICE-TOKEN-A');
    expect(a).not.toEqual(b);
    expect(await open(SECRET, a, NOW)).toEqual(await open(SECRET, b, NOW));
  });

  it('refuses a grant sealed with another secret', async () => {
    const foreign = await seal('a-different-secret-entirely', {
      t: 'apns',
      d: 'DEVICE-TOKEN-A',
      e: NOW + 100,
    });
    expect(await open(SECRET, foreign, NOW)).toBeNull();
  });

  it('refuses a tampered grant', async () => {
    const grant = await grantFor('DEVICE-TOKEN-A');
    const bytes = fromB64url(blobOf(grant));

    // Flip a bit in the CIPHERTEXT, not in the base64 text. The trailing
    // base64url character carries fewer than six significant bits, so altering
    // it can re-encode to the very same bytes — a test that did that would pass
    // without GCM ever being asked to reject anything, and only on some runs,
    // since the IV is random.
    for (const at of [IV_BYTES, bytes.length - 1]) {
      const tampered = new Uint8Array(bytes);
      tampered[at] = (tampered[at] ?? 0) ^ 0x01;
      expect(await open(SECRET, `v1.${b64url(tampered)}`, NOW)).toBeNull();
    }

    // Truncating the tag is tampering too.
    expect(await open(SECRET, `v1.${b64url(bytes.subarray(0, bytes.length - 1))}`, NOW)).toBeNull();
    // …and the untouched original still opens, so the flips above are what failed.
    expect(await open(SECRET, grant, NOW)).not.toBeNull();
  });

  it('refuses junk, truncation and the wrong version alike', async () => {
    const grant = await grantFor('DEVICE-TOKEN-A');
    for (const bad of [
      '',
      'v1',
      'v1.',
      `v2.${blobOf(grant)}`,
      blobOf(grant),
      'v1.####',
      'v1.AAAA',
    ]) {
      expect(await open(SECRET, bad, NOW), bad).toBeNull();
    }
  });

  it('refuses an expired grant', async () => {
    const grant = await grantFor('DEVICE-TOKEN-A', NOW - 1);
    expect(await open(SECRET, grant, NOW)).toBeNull();
    // …and accepts one that is still live by a second.
    expect(await open(SECRET, await grantFor('DEVICE-TOKEN-A', NOW + 1), NOW)).not.toBeNull();
  });

  it('refuses to be minted without a secret', async () => {
    await expect(seal('', { t: 'apns', d: 'x', e: NOW + 10 })).rejects.toThrow('GRANT_SECRET');
  });

  it('keys rate limits by device, stably, without revealing the token', async () => {
    // Re-minting must not buy a fresh budget, so the key follows the device and
    // not the grant.
    const a = await deviceKey('DEVICE-TOKEN-A');
    expect(await deviceKey('DEVICE-TOKEN-A')).toEqual(a);
    expect(await deviceKey('DEVICE-TOKEN-B')).not.toEqual(a);
    expect(a).not.toContain('DEVICE');
  });
});
