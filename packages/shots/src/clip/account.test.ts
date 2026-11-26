import { describe, expect, it } from 'vitest';
import {
  seededAccessToken,
  signedInStorage,
  signInAccount,
  signInFrom,
  type SweepAccount,
} from './account';

const ACCOUNT: SweepAccount = {
  server: 'http://localhost:4040',
  accessToken: 'device-token',
  token: 'session-token',
  user: { id: 'u1', language: 'de' },
  signedInHere: true,
};

describe('how a sweep signs in', () => {
  it('takes the seed file when there is one', () => {
    expect(signInFrom({ KROMA_EMAIL: 'owner', KROMA_PASSWORD: 'pw' }, 'seed.json')).toEqual({
      seed: 'seed.json',
    });
  });

  it('takes KROMA_EMAIL and KROMA_PASSWORD otherwise', () => {
    expect(signInFrom({ KROMA_EMAIL: 'owner', KROMA_PASSWORD: 'pw' })).toEqual({
      identifier: 'owner',
      password: 'pw',
    });
  });

  it('refuses to start with neither', () => {
    expect(() => signInFrom({ KROMA_EMAIL: 'owner' })).toThrow(/KROMA_PASSWORD/);
  });

  it('reads the device token off the session a seed file holds', () => {
    const entries = { 'kroma.session': JSON.stringify({ accessToken: 'device-token', user: {} }) };

    expect(seededAccessToken(entries)).toBe('device-token');
  });

  it('refuses a seed file outside the current directory', async () => {
    await expect(
      signInAccount('http://localhost:4040', { seed: '../../secrets.json' }),
    ).rejects.toThrow('the seed file must sit under');
  });

  it('refuses a seed file that holds no session', () => {
    expect(() => seededAccessToken({ 'kroma.servers': '[]' })).toThrow();
  });
});

describe('the storage a shell boots signed in from', () => {
  it('holds the session, the account remembered with it and its server', () => {
    const storage = signedInStorage(ACCOUNT);

    const session = { accessToken: 'device-token', user: ACCOUNT.user, serverUrl: ACCOUNT.server };
    expect(JSON.parse(storage['kroma.session'] ?? '')).toEqual(session);
    expect(JSON.parse(storage['kroma.accounts'] ?? '')).toEqual([session]);
    expect(JSON.parse(storage['kroma.servers'] ?? '')).toEqual([
      { url: ACCOUNT.server, name: null, lastUsedAt: 1 },
    ]);
  });
});
