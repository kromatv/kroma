// @vitest-environment jsdom
import { I18nProvider } from '@kromatv/ui';
import { createInputTestHost } from '@kromatv/ui/testing';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { PermissionSource } from '#web/features/admin/module-permissions';
import { SecurityCard } from '#web/features/admin/module-permissions-card';
import { PermissionsSheet } from '#web/features/admin/module-permissions-sheet';

const { clearPressGuard, render } = createInputTestHost();

afterEach(cleanup);

const TORRENTS: PermissionSource = {
  permissions: {
    net: {
      host: true,
      connect: [{ purpose: 'peers', to: ['public', 'lan'] }],
      listen: [{ purpose: 'peers', port: 'setting:rqbitPort' }],
    },
    fs: { read: ['downloads'], write: ['downloads'] },
    run: ['rqbit'],
  },
  storage: { core: { read: ['users.email', 'downloads'] } },
  helpers: { rqbit: {} },
  official: true,
};

function show(source: PermissionSource | null) {
  render(
    <I18nProvider locale="en">
      <SecurityCard id="tv.kroma.torrents" name="Torrents" source={source} />
      <PermissionsSheet />
    </I18nProvider>,
  );
  clearPressGuard();
}

it('opens with one verdict naming what reaches past the isolation, then four tiles', () => {
  show(TORRENTS);

  expect(screen.getByText('Extended access')).toBeTruthy();
  expect(
    screen.getByText(
      "Starts rqbit on your server, uses its direct connection and can change every folder on it, outside the module's isolation.",
    ),
  ).toBeTruthy();
  expect(screen.getByText('Accounts')).toBeTruthy();
  expect(screen.getByText('Files')).toBeTruthy();
  expect(screen.getByText('Internet')).toBeTruthy();
  expect(screen.getByText('Incoming connections')).toBeTruthy();
  expect(screen.queryByText('Local network')).toBeNull();
  expect(screen.getByText('Changes')).toBeTruthy();
});

it('opens every kind of access in the sheet, with why the extended ones reach further', async () => {
  show(TORRENTS);

  fireEvent.click(screen.getByRole('button', { name: 'Details' }));

  expect(await screen.findByText('Local network')).toBeTruthy();
  expect(screen.getByText('Server database')).toBeTruthy();
  expect(screen.getByText(/run on the server with its rights/)).toBeTruthy();
  expect(screen.getByText('Verified version, shipped with the module')).toBeTruthy();
  expect(screen.getByText('Anything not listed here is denied to it.')).toBeTruthy();
});

it('shows only the green verdict for a module that asks for nothing', () => {
  show({ permissions: {} });

  expect(screen.getByText('Isolated')).toBeTruthy();
  expect(screen.getByText('Starts no program and asks for no access.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Details' })).toBeNull();
});

it('calls a module that declares nothing isolated, and says why', () => {
  show(null);

  expect(screen.getByText('Isolated')).toBeTruthy();
  expect(screen.getByText('Declares nothing: it has no network and no program.')).toBeTruthy();
});
