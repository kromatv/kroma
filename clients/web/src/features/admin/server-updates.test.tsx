// @vitest-environment jsdom
import type { UpdateStatus } from '@kromatv/client/admin';
import { I18nProvider } from '@kromatv/ui';
import { createInputTestHost } from '@kromatv/ui/testing';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ServerUpdatesPage } from './server-updates';

const mocks = vi.hoisted(() => ({
  data: null as UpdateStatus | null,
  allowed: true,
  failed: false,
  reload: vi.fn().mockResolvedValue(undefined),
  install: vi.fn().mockResolvedValue(undefined),
  check: vi.fn().mockResolvedValue(undefined),
  settings: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({
    client: {
      admin: {
        updates: vi.fn(),
        checkUpdates: mocks.check,
        installUpdate: mocks.install,
        updateSettings: mocks.settings,
      },
    },
  }),
}));
vi.mock('#web/features/admin/shell', async () => {
  const { PageHeader } = await import('@kromatv/ui/kit');
  return {
    PageHeader,
    Denied: () => <span>Denied</span>,
    useCap: () => mocks.allowed,
    usePoll: () => ({ data: mocks.data, failed: mocks.failed, reload: mocks.reload }),
  };
});
vi.mock('#web/features/admin/server-restart-dialog', () => ({
  ServerRestartDialog: ({ onClose }: { onClose: () => void }) => (
    <button type="button" onClick={onClose}>
      Restart dialog
    </button>
  ),
}));
vi.mock('#web/shared/ui/route-link', () => ({
  RouteLink: () => <a href="/admin/backup">Backup</a>,
}));
const { render, clearPressGuard } = createInputTestHost();
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  clearPressGuard();
  mocks.allowed = true;
  mocks.failed = false;
  mocks.data = {
    version: '0.1.41',
    build: 3599999,
    channel: 'Stable',
    auto: true,
    autoInstall: false,
    available: true,
    checkedAt: '2026-10-29T10:00:00Z',
    error: null,
    latest: {
      version: '0.1.42',
      build: 3600000,
      url: 'https://github.com/kromatv/kroma/releases/tag/v0.1.42',
    },
    installer: { platform: 'docker', ready: true },
    operation: null,
    restartable: false,
  };
});
function show(props: Parameters<typeof ServerUpdatesPage>[0] = {}) {
  render(
    <I18nProvider locale="en">
      <ServerUpdatesPage {...props} />
    </I18nProvider>,
  );
}

it('requires a restart confirmation before requesting the exact reviewed build', async () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Update server' }));
  expect(mocks.install).not.toHaveBeenCalled();
  const dialog = await screen.findByRole('dialog');
  expect(dialog.textContent).toContain('every active stream will be interrupted');
  clearPressGuard();
  const buttons = screen.getAllByRole('button', { name: 'Update server' });
  fireEvent.click(buttons[buttons.length - 1]!);
  await waitFor(() =>
    expect(mocks.install).toHaveBeenCalledWith({
      channel: 'Stable',
      version: '0.1.42',
      build: 3600000,
    }),
  );
});

it('disables installation while the host updater is offline', () => {
  mocks.data!.installer!.ready = false;
  show();
  expect(screen.getByRole('button', { name: 'Update server' }).getAttribute('aria-disabled')).toBe(
    'true',
  );
  expect(screen.getByText('Host setup required')).toBeTruthy();
});

it('switches channel and checks its feed without installing', async () => {
  show();
  fireEvent.click(screen.getByRole('button', { name: 'Switch to Canary' }));
  await waitFor(() => expect(mocks.settings).toHaveBeenCalledWith({ updateChannel: 'Canary' }));
  await waitFor(() => expect(mocks.check).toHaveBeenCalled());
  expect(mocks.install).not.toHaveBeenCalled();
});

it('retains restart progress while reconnecting and blocks duplicate installs', () => {
  mocks.failed = true;
  mocks.data!.operation = {
    id: 'request',
    target: { channel: 'Stable', version: '0.1.42', build: 3600000 },
    phase: 'restarting',
    requestedAt: '2026-10-29T10:01:00Z',
  };
  show();
  expect(screen.getByText('Waiting for your server…')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Update server' })).toBeNull();
  expect(screen.getByRole('progressbar', { name: 'Update stages completed' })).toBeTruthy();
  expect(screen.getByText('Step 4 of 5')).toBeTruthy();
});

it('enables automatic installation separately from release checks', async () => {
  show();
  fireEvent.click(screen.getByRole('switch', { name: 'Install automatically when idle' }));
  await waitFor(() => expect(mocks.settings).toHaveBeenCalledWith({ autoInstallUpdates: true }));
  expect(mocks.install).not.toHaveBeenCalled();
});

it('shows backup creation directly in the main update view', () => {
  mocks.data!.operation = {
    id: 'backup',
    target: { channel: 'Stable', version: '0.1.42', build: 3600000 },
    phase: 'backing_up',
    requestedAt: '2026-10-29T10:01:00Z',
  };
  show();
  expect(screen.getByText('Step 1 of 5')).toBeTruthy();
  expect(screen.getByText('Updating your server')).toBeTruthy();
  expect(screen.queryByText('An update is ready.')).toBeNull();
});

it('does not request updates when the viewer cannot manage settings', () => {
  mocks.allowed = false;
  show();
  expect(screen.getByText('Denied')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Update server' })).toBeNull();
});

it('offers no restart where nothing would start the server again', () => {
  show();
  expect(screen.queryByRole('button', { name: 'Restart server' })).toBeNull();
});

it('asks before restarting a server that can restart itself', () => {
  mocks.data!.restartable = true;
  show();
  expect(screen.queryByText('Restart dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Restart server' }));
  expect(screen.getByText('Restart dialog')).toBeTruthy();
});

it('offers no restart while an update is being applied', () => {
  mocks.data!.restartable = true;
  mocks.data!.operation = {
    id: 'request',
    target: { channel: 'Stable', version: '0.1.42', build: 3600000 },
    phase: 'installing',
    requestedAt: '2026-10-29T10:01:00Z',
  };
  show({ restartAsked: true });
  expect(screen.queryByRole('button', { name: 'Restart server' })).toBeNull();
  expect(screen.queryByText('Restart dialog')).toBeNull();
});

it('opens the restart the command menu asked for, and forgets the request once closed', () => {
  const closed = vi.fn();
  mocks.data!.restartable = true;
  show({ restartAsked: true, onRestartClosed: closed });
  expect(closed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Restart dialog'));
  expect(closed).toHaveBeenCalledTimes(1);
});
