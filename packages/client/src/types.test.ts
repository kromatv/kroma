import { describe, expect, it } from 'vitest';
import { hasPermission } from './types';

describe('hasPermission', () => {
  it('answers from the permissions the account carries', () => {
    const user = { permissions: ['playback', 'requests.create'] } as never;
    expect(hasPermission(user, 'playback')).toBe(true);
    expect(hasPermission(user, 'users.manage')).toBe(false);
  });

  it('degrades to no permissions for a session persisted before they existed', () => {
    expect(hasPermission({} as never, 'playback')).toBe(false);
  });
});
