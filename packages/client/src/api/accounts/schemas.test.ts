import { describe, expect, it } from 'vitest';
import { hasPermission, PairingStatus, ResetCreated, User } from './schemas';

const user = {
  id: 'u1',
  email: 'max@kroma.tv',
  username: 'max',
  permissions: ['playback', 'users.manage'],
  createdAt: '2026-01-01',
  hasPin: false,
};

describe('hasPermission', () => {
  it('reads a capability the account holds', () => {
    expect(hasPermission(User.parse(user), 'users.manage')).toBe(true);
  });

  it('refuses one it does not', () => {
    expect(hasPermission(User.parse(user), 'settings.manage')).toBe(false);
  });

  it('reads a session persisted before capabilities existed as holding none', () => {
    expect(hasPermission({ permissions: undefined as unknown as string[] }, 'playback')).toBe(
      false,
    );
  });
});

describe('the account schema', () => {
  it('keeps a capability this build has never heard of, rather than throwing', () => {
    const ahead = { ...user, permissions: ['playback', 'holodeck.manage'] };

    expect(User.parse(ahead).permissions).toContain('holodeck.manage');
  });

  it('refuses a body that is not an account at all', () => {
    expect(() => User.parse({ ...user, id: 42 })).toThrow();
  });
});

describe('the pairing status', () => {
  it('reads each arm of the union the two polls answer with', () => {
    expect(PairingStatus.parse({ status: 'pending' })).toEqual({ status: 'pending' });
    expect(PairingStatus.parse({ status: 'expired' })).toEqual({ status: 'expired' });
    expect(
      PairingStatus.parse({
        status: 'authorized',
        token: 't',
        accessToken: 'a',
        user: User.parse(user),
      }).status,
    ).toBe('authorized');
  });

  it('refuses a status nothing answers with', () => {
    expect(() => PairingStatus.parse({ status: 'sideways' })).toThrow();
  });
});

describe('a minted reset', () => {
  it('reads a delivery this build does not know as a manual one', () => {
    const reset = { token: 't', code: '123456', url: null, expiresAt: 1, delivered: 'pigeon' };

    expect(ResetCreated.parse(reset).delivered).toBe('manual');
  });
});
