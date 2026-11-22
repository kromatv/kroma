// @vitest-environment jsdom

import { SetupAnswer, SetupState } from '@kromatv/client/setup';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const setup = vi.hoisted(() => ({ state: vi.fn() }));
const auth = vi.hoisted((): { user: null | { permissions: string[] } } => ({ user: null }));

vi.mock('#web/shared/lib/auth', () => ({ useAuth: () => auth }));
vi.mock('#web/shared/lib/web-runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('#web/shared/lib/web-runtime')>();
  const { createWebTestRuntime } = await import('#web/shared/lib/web-runtime.fixture');
  const runtime = createWebTestRuntime({ setup });
  return { ...original, useWebRuntime: () => runtime, useKromaClient: () => runtime.client };
});

import { resumeAt, setupAddress, useSetupState } from './setup-state';

const NOTIFY_MS = 1;

const RUNNING = { start: 'bring', step: 'media', reached: 'people', ended: false, checklist: [] };

function answer(over: { ended?: boolean } = {}) {
  return SetupAnswer.parse({ setup: { ...RUNNING, ...over } });
}

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  setup.state.mockReset().mockResolvedValue(answer());
  auth.user = null;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('where the owner goes back to', () => {
  it('is the step they stopped on, in the setup they began', () => {
    const address = resumeAt(answer());

    expect(address).toEqual({ step: 'media', start: 'bring', reached: 'people' });
  });

  it('is nowhere once they left the setup', () => {
    const address = resumeAt(answer({ ended: true }));

    expect(address).toBeNull();
  });

  it('is nowhere for someone the setup does not lead', () => {
    const address = resumeAt(SetupAnswer.parse({ setup: null }));

    expect(address).toBeNull();
  });
});

describe('the address of a step', () => {
  it('keeps how far the owner got', () => {
    const address = setupAddress(SetupState.parse(RUNNING), 'people');

    expect(address).toEqual({ step: 'people', start: 'bring', reached: 'people' });
  });
});

describe('the setup the server keeps', () => {
  it('is asked for by an account that manages the server', async () => {
    auth.user = { permissions: ['settings.manage'] };

    const { result } = renderHook(() => useSetupState(), { wrapper: wrapper() });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOTIFY_MS);
    });

    expect(result.current.data?.setup?.step).toBe('media');
  });

  it('is never asked for by a member', async () => {
    auth.user = { permissions: ['playback'] };

    renderHook(() => useSetupState(), { wrapper: wrapper() });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NOTIFY_MS);
    });

    expect(setup.state).not.toHaveBeenCalled();
  });
});
