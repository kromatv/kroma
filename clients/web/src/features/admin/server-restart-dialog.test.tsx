// @vitest-environment jsdom
import { KromaApiError } from '@kromatv/client';
import { I18nProvider } from '@kromatv/ui';
import { createInputTestHost } from '@kromatv/ui/testing';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ServerRestartDialog } from './server-restart-dialog';

const mocks = vi.hoisted(() => ({
  health: vi.fn(),
  restartServer: vi.fn(),
  onClose: vi.fn(),
  onRestarted: vi.fn(),
}));
vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({
    client: {
      media: { health: mocks.health },
      admin: { restartServer: mocks.restartServer },
    },
  }),
}));

const { render, clearPressGuard } = createInputTestHost();
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  clearPressGuard();
  mocks.restartServer.mockResolvedValue(undefined);
});

function show() {
  render(
    <I18nProvider locale="en">
      <ServerRestartDialog onClose={mocks.onClose} onRestarted={mocks.onRestarted} />
    </I18nProvider>,
  );
}

function press(name: string) {
  clearPressGuard();
  fireEvent.click(screen.getByRole('button', { name }));
}

it('warns that playback stops before anything is asked of the server', () => {
  show();

  expect(screen.getByRole('dialog').textContent).toContain('Playback in progress stops');
  expect(mocks.restartServer).not.toHaveBeenCalled();
});

it('lets the owner back out', () => {
  show();

  press('Cancel');

  expect(mocks.onClose).toHaveBeenCalled();
  expect(mocks.restartServer).not.toHaveBeenCalled();
});

it('waits for the server to answer as a new process, then hands over', async () => {
  mocks.health
    .mockResolvedValueOnce({ bootId: 'before' })
    .mockResolvedValueOnce({ bootId: 'after' });
  show();

  press('Restart server');

  await waitFor(() => expect(mocks.onRestarted).toHaveBeenCalled());
  expect(mocks.restartServer).toHaveBeenCalledTimes(1);
  expect(screen.getByText('This page reloads as soon as the server answers.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
});

it('does not hand over while the old process still answers', async () => {
  mocks.health.mockResolvedValue({ bootId: 'before' });
  show();

  press('Restart server');

  await screen.findByText('This page reloads as soon as the server answers.');
  await waitFor(() => expect(mocks.health).toHaveBeenCalledTimes(2));
  expect(mocks.onRestarted).not.toHaveBeenCalled();
});

it('says why the server refused, and stays open', async () => {
  mocks.health.mockResolvedValue({ bootId: 'before' });
  mocks.restartServer.mockRejectedValue(
    new KromaApiError(409, 'POST /admin/server/restart failed (409)', {
      error: 'An update is in progress and will restart the server itself.',
      code: 'admin.serverRestartDuringUpdate',
    }),
  );
  show();

  press('Restart server');

  expect(
    await screen.findByText('An update is in progress and will restart the server itself.'),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  expect(mocks.onRestarted).not.toHaveBeenCalled();
});
