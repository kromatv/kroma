// @vitest-environment jsdom

import { BackupSchedule } from '@kromatv/client/admin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const backup = vi.hoisted(() => ({ schedule: vi.fn(), changeSchedule: vi.fn() }));

vi.mock('#web/shared/lib/web-runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('#web/shared/lib/web-runtime')>();
  const { createWebTestRuntime } = await import('#web/shared/lib/web-runtime.fixture');
  const runtime = createWebTestRuntime({ admin: { backup } });
  return { ...original, useWebRuntime: () => runtime, useKromaClient: () => runtime.client };
});

import { useBackupsAnswer } from './use-backups-answer.hook';

const NOTIFY_MS = 1;

function held(over: { enabled: boolean }) {
  return BackupSchedule.parse({ folder: '/data/backups', chosen: false, keep: 7, ...over });
}

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

async function answered() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(NOTIFY_MS);
  });
}

async function renderAnswer(onAnswered = vi.fn()) {
  const rendered = renderHook(() => useBackupsAnswer(onAnswered), { wrapper: wrapper() });
  await answered();
  return rendered;
}

beforeEach(() => {
  backup.schedule.mockReset().mockResolvedValue(held({ enabled: false }));
  backup.changeSchedule.mockReset().mockResolvedValue(held({ enabled: true }));
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the backups switch of the setup', () => {
  it('is off on a new server', async () => {
    const { result } = await renderAnswer();

    expect(result.current.enabled).toBe(false);
  });

  it('is on for an owner who turned scheduled backups on under Admin', async () => {
    backup.schedule.mockResolvedValue(held({ enabled: true }));

    const { result } = await renderAnswer();

    expect(result.current.enabled).toBe(true);
  });

  it('shows no state before the server has said which one it holds', () => {
    backup.schedule.mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => useBackupsAnswer(vi.fn()), { wrapper: wrapper() });

    expect(result.current.enabled).toBeNull();
  });

  it('turns scheduled backups on when the owner switched it on', async () => {
    const { result } = await renderAnswer();
    act(() => result.current.setEnabled(true));

    await act(() => result.current.confirm());

    expect(backup.changeSchedule).toHaveBeenCalledWith({ enabled: true });
  });

  it('writes nothing when the owner left it as it was', async () => {
    const onAnswered = vi.fn();
    const { result } = await renderAnswer(onAnswered);

    await act(() => result.current.confirm());

    expect(backup.changeSchedule).not.toHaveBeenCalled();
    expect(onAnswered).toHaveBeenCalled();
  });

  it('stays on the step when the server refused the change', async () => {
    backup.changeSchedule.mockRejectedValue(new Error('refused'));
    const onAnswered = vi.fn();
    const { result } = await renderAnswer(onAnswered);
    act(() => result.current.setEnabled(true));

    await act(() => result.current.confirm());

    expect(onAnswered).not.toHaveBeenCalled();
    expect(result.current.refusal).not.toBeNull();
  });

  it('says so when the setting could not be read', async () => {
    backup.schedule.mockRejectedValue(new Error('offline'));

    const { result } = await renderAnswer();

    expect(result.current.failed).toBe(true);
  });
});
