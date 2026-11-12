// @vitest-environment jsdom
import type { ModuleNav } from '@kromatv/module-sdk';
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetCommands, listedCommands } from '#web/shared/lib/command-menu.fixture';
import { CATALOG_NAV } from './catalog-nav';
import { useCatalogCommands } from './use-catalog-commands';

const mocks = vi.hoisted(() => ({ modulePages: [] as ModuleNav[] }));
vi.mock('@kromatv/ui', () => ({ useT: () => (key: string) => key }));
vi.mock('#web/modules/ModuleHostProvider', () => ({ useModuleNav: () => mocks.modulePages }));
vi.mock('#web/shared/lib/command-menu', async () => ({
  useCommands: (await import('#web/shared/lib/command-menu.fixture')).useFakeCommands,
}));

const at = (to: string) => listedCommands().find((command) => command.to === to);

beforeEach(() => {
  mocks.modulePages = [];
});

afterEach(() => {
  cleanup();
  forgetCommands();
});

describe('the catalogue in the command menu', () => {
  it('lists every page of the catalogue navigation', () => {
    renderHook(() => useCatalogCommands());

    expect(listedCommands().map((command) => command.to)).toEqual(
      expect.arrayContaining(CATALOG_NAV.map((item) => item.to)),
    );
  });

  it('files a page under its heading', () => {
    renderHook(() => useCatalogCommands());

    expect(at('/invite')?.group).toBe('nav.more');
  });

  it('keeps the headings in the sidebar’s order', () => {
    renderHook(() => useCatalogCommands());

    const headings = new Set(listedCommands().map((command) => command.group));

    expect([...headings]).toEqual(['nav.discover', 'nav.yourSpace', 'nav.more']);
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
