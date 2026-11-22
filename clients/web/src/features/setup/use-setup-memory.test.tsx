// @vitest-environment jsdom

import { SetupAnswer } from '@kromatv/client/setup';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setup = vi.hoisted(() => ({ advance: vi.fn(), confirm: vi.fn(), end: vi.fn() }));
const session = vi.hoisted(() => ({ authed: true }));

vi.mock('#web/shared/lib/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('#web/shared/lib/api')>();
  return { ...original, isAuthed: () => session.authed };
});
vi.mock('#web/shared/lib/web-runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('#web/shared/lib/web-runtime')>();
  const { createWebTestRuntime } = await import('#web/shared/lib/web-runtime.fixture');
  const runtime = createWebTestRuntime({ setup });
  return { ...original, useWebRuntime: () => runtime, useKromaClient: () => runtime.client };
});

import { SETUP_STATE_QUERY } from '#web/shared/lib/setup-state';
import { useSetupMemory } from './use-setup-memory.hook';

let queries: QueryClient;

function answer(step: string, over: { ended?: boolean } = {}) {
  return SetupAnswer.parse({
    setup: { start: 'fresh', step, reached: step, ended: false, checklist: [], ...over },
  });
}

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queries}>{children}</QueryClientProvider>;
}

function kept() {
  return queries.getQueryData<SetupAnswer>(SETUP_STATE_QUERY)?.setup;
}

function later<T>(value: T) {
  const held: { settle?: () => void } = {};
  const promise = new Promise<T>((resolve) => {
    held.settle = () => resolve(value);
  });
  return { promise, settle: () => held.settle?.() };
}

beforeEach(() => {
  queries = new QueryClient();
  session.authed = true;
  setup.advance.mockReset().mockResolvedValue(answer('people'));
  setup.confirm.mockReset().mockResolvedValue(answer('privacy'));
  setup.end.mockReset().mockResolvedValue(answer('privacy', { ended: true }));
});

describe('an owner moving through the setup', () => {
  it('tells the server the step they are on', async () => {
    const { result } = renderHook(() => useSetupMemory(), { wrapper });

    await act(() => result.current.advance('people', 'bring'));

    expect(setup.advance).toHaveBeenCalledWith({ step: 'people', start: 'bring' });
  });

  it('keeps what the server answered', async () => {
    const { result } = renderHook(() => useSetupMemory(), { wrapper });

    await act(() => result.current.advance('people', 'fresh'));

    expect(kept()?.step).toBe('people');
  });

  it('keeps the last word when an earlier answer comes back late', async () => {
    const slow = later(answer('media'));
    setup.advance.mockReturnValue(slow.promise);
    const { result } = renderHook(() => useSetupMemory(), { wrapper });
    const moved = result.current.advance('media', 'fresh');
    const ended = result.current.end();

    await act(async () => {
      slow.settle();
      await Promise.all([moved, ended]);
    });

    expect(kept()?.ended).toBe(true);
  });

  it('stays where they are when the server cannot be told', async () => {
    setup.confirm.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useSetupMemory(), { wrapper });

    await act(() => result.current.confirm('privacy'));

    expect(kept()).toBeUndefined();
  });
});

describe('a visitor before the owner account exists', () => {
  it('tells the server nothing', async () => {
    session.authed = false;
    const { result } = renderHook(() => useSetupMemory(), { wrapper });

    await act(() => result.current.advance('owner', 'fresh'));

    expect(setup.advance).not.toHaveBeenCalled();
  });
});
