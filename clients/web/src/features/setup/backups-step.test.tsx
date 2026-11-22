// @vitest-environment jsdom

import { KromaApiError } from '@kromatv/client';
import { BackupSchedule } from '@kromatv/client/admin';
import { GuidedFlow } from '@kromatv/ui/kit';
import { onScreen } from '@kromatv/ui/testing';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const backup = vi.hoisted(() => ({ schedule: vi.fn(), changeSchedule: vi.fn() }));

vi.mock('#web/shared/lib/web-runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('#web/shared/lib/web-runtime')>();
  const { createWebTestRuntime } = await import('#web/shared/lib/web-runtime.fixture');
  const runtime = createWebTestRuntime({ admin: { backup } });
  return { ...original, useWebRuntime: () => runtime, useKromaClient: () => runtime.client };
});

import { BackupsStep } from './backups-step.component';

const REFUSED = 'This folder is not there. Choose it again in the list.';

function held(over: { enabled?: boolean } = {}) {
  return BackupSchedule.parse({ enabled: false, folder: '/data', chosen: false, keep: 7, ...over });
}

function renderStep(onContinue = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    onScreen(
      <QueryClientProvider client={client}>
        <GuidedFlow.Root label="Setup">
          <BackupsStep onBack={vi.fn()} onContinue={onContinue} />
        </GuidedFlow.Root>
      </QueryClientProvider>,
    ),
  );
  return onContinue;
}

beforeEach(() => {
  backup.schedule.mockReset().mockResolvedValue(held());
  backup.changeSchedule.mockReset().mockResolvedValue(held({ enabled: true }));
});

afterEach(() => {
  cleanup();
});

describe('the backups step', () => {
  it('holds the switch in the state the server holds', async () => {
    renderStep();

    const toggle = await screen.findByRole('switch');

    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('moves on once the owner continues', async () => {
    const onContinue = renderStep();
    await screen.findByRole('switch');

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(onContinue).toHaveBeenCalled());
  });

  it('says the setting could not be read', async () => {
    backup.schedule.mockRejectedValue(new Error('offline'));

    renderStep();

    expect(
      await screen.findByText(
        'KROMA could not read this setting. Reload the page, then try again.',
      ),
    ).toBeTruthy();
  });

  it('says why the server refused the switch', async () => {
    backup.changeSchedule.mockRejectedValue(
      new KromaApiError(400, 'PUT /admin/backup/schedule failed (400)', { error: REFUSED }),
    );
    renderStep();
    fireEvent.click(await screen.findByRole('switch'));

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText(REFUSED)).toBeTruthy();
  });
});
