import { describe, expect, it, vi } from 'vitest';
import { accountPanes } from './account-panes';
import { paneId } from './panes';

const actions = { switchProfile: vi.fn(), signOut: vi.fn() };

const ids = (user: { hasPin: boolean; kids?: boolean }) => accountPanes(user, actions).map(paneId);

describe('the account’s panes in the settings', () => {
  it('give a profile its PIN, switching profile and signing out', () => {
    expect(ids({ hasPin: false })).toEqual(['pin', 'changeProfile', 'signOut']);
  });

  it('leave a Kids session only the way out, switching profile', () => {
    expect(ids({ hasPin: false, kids: true })).toEqual(['changeProfile']);
  });
});
