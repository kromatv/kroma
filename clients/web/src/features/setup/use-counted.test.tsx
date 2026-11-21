// @vitest-environment jsdom

import { SettingsView } from '@kromatv/client/admin';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const admin = vi.hoisted(() => ({ settings: vi.fn(), updateSettings: vi.fn() }));

vi.mock('#web/shared/lib/web-runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('#web/shared/lib/web-runtime')>();
  const { createWebTestRuntime } = await import('#web/shared/lib/web-runtime.fixture');
  const runtime = createWebTestRuntime({ admin });
  return { ...original, useWebRuntime: () => runtime, useKromaClient: () => runtime.client };
});

import { useCounted } from './use-counted.hook';

const NOTIFY_MS = 1;

function held(anonStats: unknown) {
  return SettingsView.parse({
    view: 'general',
    groups: [
      {
        title: 'Privacy',
        rows: [
          {
            key: 'anonStats',
            label: 'Statistics',
            kind: 'toggle',
            value: anonStats,
            applied: true,
          },
        ],
      },
    ],
  });
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

async function renderCounted(onAnswered = vi.fn()) {
  const rendered = renderHook(() => useCounted(onAnswered), { wrapper: wrapper() });
  await answered();
  return rendered;
}

beforeEach(() => {
  admin.settings.mockReset().mockResolvedValue(held(true));
  admin.updateSettings.mockReset().mockResolvedValue({});
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the being-counted switch', () => {
  it('is off for an owner who turned it off under Admin', async () => {
    admin.settings.mockResolvedValue(held(false));

    const { result } = await renderCounted();

    expect(result.current.counted).toBe(false);
  });

  it('is on for a server that holds the default', async () => {
    const { result } = await renderCounted();

    expect(result.current.counted).toBe(true);
  });

  it('shows no state before the server has said which one it holds', () => {
    admin.settings.mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => useCounted(vi.fn()), { wrapper: wrapper() });

    expect(result.current.counted).toBeNull();
  });

  it('writes the state the owner left it in', async () => {
    const { result } = await renderCounted();
    act(() => result.current.setCounted(false));

    await act(() => result.current.confirm());

    expect(admin.updateSettings).toHaveBeenCalledWith({ anonStats: false });
  });
});

describe('a setting the server could not read', () => {
  it('says so', async () => {
    admin.settings.mockRejectedValue(new Error('offline'));

    const { result } = await renderCounted();

    expect(result.current.failed).toBe(true);
  });

  it('moves on without writing a state nobody saw', async () => {
    admin.settings.mockRejectedValue(new Error('offline'));
    const onAnswered = vi.fn();
    const { result } = await renderCounted(onAnswered);

    await act(() => result.current.confirm());

    expect(admin.updateSettings).not.toHaveBeenCalled();
    expect(onAnswered).toHaveBeenCalled();
  });
});
