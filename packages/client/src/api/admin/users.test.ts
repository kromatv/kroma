import { describe, expect, it } from 'vitest';
import { AdminUser } from './users';

const member = {
  id: 'u1',
  email: 'max@kroma.tv',
  username: 'max',
  permissions: ['playback'],
  libraries: null,
  role: 'admin.roleMember',
  createdAt: '2026-01-01',
  online: false,
  emailVerified: false,
  hasPin: false,
  resetRequested: false,
  kids: false,
};

describe('an account on the member list', () => {
  it('waits on an invitation with no address, and says where the invitation stands', () => {
    const waiting = AdminUser.parse({ ...member, email: null, invitation: 'expired' });

    expect(waiting.email).toBeNull();
    expect(waiting.invitation).toBe('expired');
  });

  it('does not wait when its person holds it', () => {
    const held = AdminUser.parse({ ...member, invitation: null });

    expect(held.invitation).toBeNull();
    expect(held.email).toBe('max@kroma.tv');
  });

  it('reads a server that cannot make an account wait', () => {
    const older = AdminUser.parse(member);

    expect(older.invitation).toBeUndefined();
  });

  it('refuses an invitation state this build has never heard of', () => {
    const parsed = AdminUser.safeParse({ ...member, invitation: 'revoked' });

    expect(parsed.success).toBe(false);
  });
});
