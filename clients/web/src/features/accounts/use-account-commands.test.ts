// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommandDef } from '#web/shared/lib/command-menu';
import { useAccountCommands } from './use-account-commands';

const mocks = vi.hoisted(() => ({ commands: [] as readonly CommandDef[], logout: vi.fn() }));
vi.mock('@kromatv/ui', () => ({ useT: () => (key: string) => key }));
vi.mock('@tanstack/react-router', () => ({
  useRouterState: () => '/movies?sort=recent',
}));
vi.mock('#web/shared/lib/auth', () => ({ useAuth: () => ({ logout: mocks.logout }) }));
vi.mock('#web/shared/lib/command-menu', () => ({
  useCommands: (commands: readonly CommandDef[]) => {
    mocks.commands = commands;
  },
}));

const row = (label: string) => mocks.commands.find((command) => command.label === label);

afterEach(cleanup);

describe('the account in the command menu', () => {
  it('brings the viewer back here after switching profile', () => {
    renderHook(() => useAccountCommands());

    expect(row('nav.changeProfile')).toMatchObject({
      to: '/login',
      search: { redirect: '/movies?sort=recent' },
    });
  });

  it('signs the viewer out', () => {
    renderHook(() => useAccountCommands());

    void row('auth.logout')?.run?.();

    expect(mocks.logout).toHaveBeenCalledTimes(1);
  });
});
