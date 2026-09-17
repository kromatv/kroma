import { seal as sealPayload } from '@kromatv/relay-grant';
import { describe, expect, it } from 'vitest';
import { deviceKey, GRANT_TTL_SECS, open, seal } from './grant';

const SECRET = 'a-test-sealing-secret-that-is-long-enough';
const NOW = 1_800_000_000;

const grantFor = (token: string, exp = NOW + GRANT_TTL_SECS) =>
  seal(SECRET, { t: 'apns', d: token, e: exp });

describe('push grants', () => {
  it('round-trips exactly what was sealed', async () => {
    const grant = await grantFor('DEVICE-TOKEN-A');

    expect(await open(SECRET, grant, NOW)).toEqual({
      t: 'apns',
      d: 'DEVICE-TOKEN-A',
      e: NOW + GRANT_TTL_SECS,
    });
  });

  it('hides the device token it carries', async () => {
    const grant = await grantFor('DEVICE-TOKEN-A');

    expect(grant.startsWith('v1.')).toBe(true);
    expect(grant).not.toContain('DEVICE-TOKEN-A');
  });

  it('refuses a grant sealed with another secret, or expired', async () => {
    const foreign = await seal('a-different-secret-entirely', {
      t: 'apns',
      d: 'DEVICE-TOKEN-A',
      e: NOW + 100,
    });

    expect(await open(SECRET, foreign, NOW)).toBeNull();
    expect(await open(SECRET, await grantFor('DEVICE-TOKEN-A', NOW - 1), NOW)).toBeNull();
  });

  it('refuses a blob that opens under its own salt but names no transport', async () => {
    const shapeless = await sealPayload(
      { secret: SECRET, salt: 'kroma.push.relay' },
      { d: 'x', e: NOW + 100 },
    );

    expect(await open(SECRET, shapeless, NOW)).toBeNull();
  });

  it('refuses a grant another relay sealed with the same secret', async () => {
    const mail = await sealPayload(
      { secret: SECRET, salt: 'kroma.mail.relay' },
      { t: 'apns', d: 'x', e: NOW + 100 },
    );

    expect(await open(SECRET, mail, NOW)).toBeNull();
  });

  it('keys rate limits by device, stably, without revealing the token', async () => {
    const a = await deviceKey('DEVICE-TOKEN-A');

    expect(await deviceKey('DEVICE-TOKEN-A')).toEqual(a);
    expect(await deviceKey('DEVICE-TOKEN-B')).not.toEqual(a);
    expect(a).not.toContain('DEVICE');
  });
});
