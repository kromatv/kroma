// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import { forgetCommands, listedCommands } from '#web/shared/lib/command-menu.fixture';
import { useAccountCommands } from './use-account-commands.hook';

interface Mocks {
  logout: Mock;
  user: { kids: boolean } | null;
}

const mocks: Mocks = vi.hoisted(() => ({ logout: vi.fn(), user: null }));
vi.mock('@kromatv/ui', () => ({ useT: () => (key: string) => key }));
vi.mock('@tanstack/react-router', () => ({
  useRouterState: () => '/movies?sort=recent',
}));
vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({ logout: mocks.logout, user: mocks.user }),
}));
vi.mock('#web/shared/lib/command-menu', async () => ({
  useCommands: (await import('#web/shared/lib/command-menu.fixture')).useFakeCommands,
}));

const row = (label: string) => listedCommands().find((command) => command.label === label);

afterEach(() => {
  cleanup();
  forgetCommands();
  mocks.user = null;
});

describe('the account in the command menu', () => {
  it('brings the viewer back here after switching profile', () => {
    renderHook(() => useAccountCommands());

    expect(row('nav.changeProfile')).toMatchObject({
      to: '/login',
      search: { redirect: '/movies?sort=recent' },
    });
  });

  it('files every row under the account', () => {
    renderHook(() => useAccountCommands());

    expect(listedCommands().every((command) => command.group === 'nav.account')).toBe(true);
  });

  it('signs the viewer out', () => {
    renderHook(() => useAccountCommands());

    void row('auth.logout')?.run?.();

    expect(mocks.logout).toHaveBeenCalledTimes(1);
  });

  it('leaves a Kids session nothing but switching profile', () => {
    mocks.user = { kids: true };

    renderHook(() => useAccountCommands());

    expect(listedCommands().map((command) => command.label)).toEqual(['nav.changeProfile']);
  });
});
