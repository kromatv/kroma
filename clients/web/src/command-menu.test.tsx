// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandMenu } from './command-menu';

const mocks = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock('#web/features/catalog/use-catalog-commands', () => ({
  useCatalogCommands: () => mocks.calls.push('catalog'),
}));
vi.mock('#web/features/accounts/use-account-commands', () => ({
  useAccountCommands: () => mocks.calls.push('account'),
}));
vi.mock('#web/features/admin/use-admin-commands', () => ({
  useAdminCommands: () => mocks.calls.push('admin'),
}));
vi.mock('#web/features/catalog/use-library-search-commands', () => ({
  useLibrarySearchCommands: () => mocks.calls.push('search'),
}));
vi.mock('#web/shared/ui/command-palette', () => ({ CommandPalette: () => null }));

afterEach(cleanup);

describe('CommandMenu', () => {
  it('lists the catalogue, the account and the console, with search last so ties stay below', () => {
    mocks.calls = [];

    render(<CommandMenu />);

    expect(mocks.calls).toEqual(['catalog', 'account', 'admin', 'search']);
  });
});
