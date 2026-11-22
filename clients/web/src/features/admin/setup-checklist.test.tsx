// @vitest-environment jsdom

import { SetupAnswer } from '@kromatv/client/setup';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setup = vi.hoisted(() => ({ state: vi.fn(), dismiss: vi.fn() }));

vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({ user: { permissions: ['settings.manage'] } }),
}));
vi.mock('#web/shared/lib/web-runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('#web/shared/lib/web-runtime')>();
  const { createWebTestRuntime } = await import('#web/shared/lib/web-runtime.fixture');
  const runtime = createWebTestRuntime({ setup });
  return { ...original, useWebRuntime: () => runtime, useKromaClient: () => runtime.client };
});

import { useSetupChecklist } from './setup-checklist.component';

const NOTIFY_MS = 1;

function ended(checklist: string[]) {
  return SetupAnswer.parse({
    setup: { start: 'fresh', step: 'media', reached: 'media', ended: true, checklist },
  });
}

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

async function settled(work: Promise<unknown> = Promise.resolve()) {
  await act(async () => {
    await work;
    await vi.advanceTimersByTimeAsync(NOTIFY_MS);
  });
}

async function renderChecklist() {
  const rendered = renderHook(() => useSetupChecklist(), { wrapper: wrapper() });
  await settled();
  return rendered;
}

beforeEach(() => {
  vi.useFakeTimers();
  setup.state.mockReset().mockResolvedValue(ended(['media', 'people']));
  setup.dismiss.mockReset().mockResolvedValue(ended(['media']));
});

describe('the dashboard checklist', () => {
  it('holds one line per step the setup left', async () => {
    const { result } = await renderChecklist();

    expect(result.current.setup?.checklist).toEqual(['media', 'people']);
  });

  it('loses a line the owner dismissed', async () => {
    const { result } = await renderChecklist();

    await settled(result.current.dismiss('people'));

    expect(result.current.setup?.checklist).toEqual(['media']);
  });

  it('is gone once no line is left', async () => {
    setup.state.mockResolvedValue(ended([]));

    const { result } = await renderChecklist();

    expect(result.current.setup).toBeNull();
  });

  it('is absent on a server whose owner came before the setup', async () => {
    setup.state.mockResolvedValue(SetupAnswer.parse({ setup: null }));

    const { result } = await renderChecklist();

    expect(result.current.setup).toBeNull();
  });
});
