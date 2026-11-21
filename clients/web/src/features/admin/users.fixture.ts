import { AdminUser } from '@kromatv/client/admin';

/** One account of the member list, held by its person unless `fields` says
 * otherwise. */
export function member(fields: Partial<Record<keyof AdminUser, unknown>> = {}): AdminUser {
  return AdminUser.parse({
    id: 'u1',
    email: 'lea@kroma.tv',
    username: 'lea',
    permissions: ['playback'],
    libraries: null,
    role: 'admin.roleMember',
    createdAt: '2026-01-01',
    online: false,
    emailVerified: false,
    hasPin: false,
    resetRequested: false,
    ...fields,
  });
}
