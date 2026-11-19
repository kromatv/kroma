// @vitest-environment jsdom

import { ImporterList } from '@kromatv/client/importers';
import { ModuleId } from '@kromatv/client/modules';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const importers = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock('#web/shared/lib/web-runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('#web/shared/lib/web-runtime')>();
  const { createWebTestRuntime } = await import('#web/shared/lib/web-runtime.fixture');
  const runtime = createWebTestRuntime({ importers });
  return { ...original, useWebRuntime: () => runtime, useKromaClient: () => runtime.client };
});

import { stillStarting, useImporter, useImporters } from './use-importers.hook';

const ASK_AGAIN_MS = 1500;
const NOTIFY_MS = 1;
const CHOSEN = ModuleId.parse('tv.test.chosen');
const OTHER = ModuleId.parse('tv.test.other');

function listOf(...held: { id: string; running: boolean }[]) {
  return ImporterList.parse({
    importers: held.map(({ id, running }) => ({
      id,
      name: id,
      installed: true,
      running,
      fields: [],
    })),
  });
}

const STARTING = listOf({ id: CHOSEN, running: false });
const RUNNING = listOf({ id: CHOSEN, running: true });

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

async function elapse(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function answered() {
  await elapse(NOTIFY_MS);
}

beforeEach(() => {
  importers.list.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('whether the list is asked again', () => {
  it('is asked again while the chosen importer installs or starts', () => {
    expect(stillStarting(STARTING, CHOSEN)).toBe(true);
  });

  it('is left alone once the chosen importer runs', () => {
    expect(stillStarting(RUNNING, CHOSEN)).toBe(false);
  });

  it('is left alone before the owner chose an importer', () => {
    expect(stillStarting(STARTING, null)).toBe(false);
  });

  it('is left alone for an importer the list does not hold', () => {
    expect(stillStarting(STARTING, OTHER)).toBe(false);
  });

  it('is left alone before the server gave a list', () => {
    expect(stillStarting(undefined, CHOSEN)).toBe(false);
  });
});

describe('the importers the server can use', () => {
  it('lists what the server answered', async () => {
    importers.list.mockResolvedValue(RUNNING);

    const { result } = renderHook(() => useImporters(), { wrapper: wrapper() });
    await answered();

    expect(result.current.data).toEqual(RUNNING);
  });
});

describe('the importer the owner chose', () => {
  it('is the one the list holds under that id', async () => {
    importers.list.mockResolvedValue(listOf({ id: OTHER, running: true }, ...RUNNING.importers));

    const { result } = renderHook(() => useImporter(CHOSEN), { wrapper: wrapper() });
    await answered();

    expect(result.current).toEqual(RUNNING.importers[0]);
  });

  it('is nobody before the owner chose one', async () => {
    importers.list.mockResolvedValue(RUNNING);

    const { result } = renderHook(() => useImporter(null), { wrapper: wrapper() });
    await answered();

    expect(result.current).toBeNull();
  });

  it('is asked for again until it runs', async () => {
    importers.list.mockResolvedValueOnce(STARTING).mockResolvedValue(RUNNING);
    const { result } = renderHook(() => useImporter(CHOSEN), { wrapper: wrapper() });
    await answered();

    await elapse(ASK_AGAIN_MS);
    await answered();

    expect(result.current?.running).toBe(true);
    expect(importers.list).toHaveBeenCalledTimes(2);
  });

  it('is not asked for before the wait is over', async () => {
    importers.list.mockResolvedValue(STARTING);
    renderHook(() => useImporter(CHOSEN), { wrapper: wrapper() });
    await answered();

    await elapse(ASK_AGAIN_MS - NOTIFY_MS - 1);

    expect(importers.list).toHaveBeenCalledOnce();
  });

  it('is asked for no more once it runs', async () => {
    importers.list.mockResolvedValueOnce(STARTING).mockResolvedValue(RUNNING);
    renderHook(() => useImporter(CHOSEN), { wrapper: wrapper() });
    await answered();
    await elapse(ASK_AGAIN_MS);

    await elapse(ASK_AGAIN_MS * 4);

    expect(importers.list).toHaveBeenCalledTimes(2);
  });
});
