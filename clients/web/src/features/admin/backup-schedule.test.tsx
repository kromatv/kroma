// @vitest-environment jsdom

import { KromaApiError } from '@kromatv/client';
import { BackupSchedule } from '@kromatv/client/admin';
import { onScreen } from '@kromatv/ui/testing';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backupJob } from './backup-job.fixture';

const backup = vi.hoisted(() => ({ schedule: vi.fn(), changeSchedule: vi.fn() }));
const jobs = vi.hoisted(() => ({ detail: vi.fn() }));

vi.mock('#web/shared/ui/route-link.component', () => ({ RouteLink: () => null }));
vi.mock('#web/shared/lib/web-runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('#web/shared/lib/web-runtime')>();
  const { createWebTestRuntime } = await import('#web/shared/lib/web-runtime.fixture');
  const runtime = createWebTestRuntime({ admin: { backup }, jobs });
  return { ...original, useWebRuntime: () => runtime, useKromaClient: () => runtime.client };
});

import { BackupScheduleSection } from './backup-schedule.component';

function held(over: { enabled?: boolean; chosen?: boolean } = {}) {
  return BackupSchedule.parse({
    enabled: false,
    folder: '/data/backups',
    chosen: false,
    keep: 7,
    ...over,
  });
}

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    onScreen(
      <QueryClientProvider client={client}>
        <BackupScheduleSection />
      </QueryClientProvider>,
    ),
  );
}

beforeEach(() => {
  backup.schedule.mockReset().mockResolvedValue(held());
  backup.changeSchedule.mockReset().mockResolvedValue(held({ enabled: true }));
  jobs.detail.mockReset().mockResolvedValue(backupJob(null));
});

afterEach(() => {
  cleanup();
});

describe('the scheduled backups section', () => {
  it('draws nothing before the server has said how they stand', () => {
    backup.schedule.mockReturnValue(new Promise(() => undefined));

    const { container } = renderSection();

    expect(container.textContent).toBe('');
  });

  it('says no backup was saved yet on a new server', async () => {
    renderSection();

    expect(await screen.findByText('No backup saved yet.')).toBeTruthy();
  });

  it('says when the last backup was saved', async () => {
    jobs.detail.mockResolvedValue(backupJob({ status: 'success' }));

    renderSection();

    expect(await screen.findByText(/^Last backup saved/)).toBeTruthy();
  });

  it('shows why the last backup failed', async () => {
    jobs.detail.mockResolvedValue(backupJob({ status: 'failed', error: '/mnt/nas is not there' }));

    renderSection();

    expect(await screen.findByText('/mnt/nas is not there')).toBeTruthy();
  });

  it('shows the folder the backups go to', async () => {
    backup.schedule.mockResolvedValue(held({ chosen: true }));

    renderSection();

    expect(await screen.findByText('/data/backups')).toBeTruthy();
  });

  it('turns the backups on from the switch', async () => {
    renderSection();

    fireEvent.click(await screen.findByRole('switch'));

    expect(backup.changeSchedule).toHaveBeenCalledWith({ enabled: true });
  });

  it('says why the server refused a change', async () => {
    backup.changeSchedule.mockRejectedValue(
      new KromaApiError(400, 'PUT /admin/backup/schedule failed (400)', {
        error: 'This folder is not there. Choose it again in the list.',
      }),
    );
    renderSection();

    fireEvent.click(await screen.findByRole('switch'));

    expect(
      await screen.findByText('This folder is not there. Choose it again in the list.'),
    ).toBeTruthy();
  });
});
