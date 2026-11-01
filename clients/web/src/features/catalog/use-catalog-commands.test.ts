// @vitest-environment jsdom
import type { ModuleNav } from '@kromatv/module-sdk';
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandDef } from '#web/shared/lib/command-menu';
import { CATALOG_NAV } from './catalog-nav';
import { useCatalogCommands } from './use-catalog-commands';

const mocks = vi.hoisted(() => ({
  commands: [] as readonly CommandDef[],
  modulePages: [] as ModuleNav[],
}));
vi.mock('@kromatv/ui', () => ({ useT: () => (key: string) => key }));
vi.mock('#web/modules/ModuleHostProvider', () => ({ useModuleNav: () => mocks.modulePages }));
vi.mock('#web/shared/lib/command-menu', () => ({
  useCommands: (commands: readonly CommandDef[]) => {
    mocks.commands = commands;
  },
}));

const at = (to: string) => mocks.commands.find((command) => command.to === to);

beforeEach(() => {
  mocks.modulePages = [];
});

afterEach(cleanup);

describe('the catalogue in the command menu', () => {
  it('lists every page of the catalogue navigation', () => {
    renderHook(() => useCatalogCommands());

    expect(mocks.commands.map((command) => command.to)).toEqual(
      expect.arrayContaining(CATALOG_NAV.map((item) => item.to)),
    );
  });

  it('offers requests only to who may make one', () => {
    renderHook(() => useCatalogCommands());

    expect(at('/requests')?.cap).toBe('requests.create');
  });

  it('offers invitations only to who manages users', () => {
    renderHook(() => useCatalogCommands());

    expect(at('/invite')?.cap).toBe('users.manage');
  });

  it('lists a module’s catalogue page, with nothing else to declare', () => {
    mocks.modulePages = [
      { moduleId: 'tv.kroma.stats', to: '/stats', label: 'Stats', icon: 'chart' },
    ];

    renderHook(() => useCatalogCommands());

    expect(at('/stats')).toMatchObject({
      label: 'Stats',
      group: 'nav.yourSpace',
      icon: 'chart-bar',
    });
  });
});
