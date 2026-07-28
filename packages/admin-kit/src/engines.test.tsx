// @vitest-environment jsdom
//
// Which engine add-flows the admin console offers.
//
// These two hooks decide what a host page renders, from data the server sends,
// so a wrong answer is a feature that silently vanishes or one that is offered
// and cannot work. Two rules carry that weight:
//
//   A module with no add-flow is not an option. The always-on embedded engines
//   (rqbit) provide a capability but have nothing to add, so offering them puts
//   an empty form in front of someone.
//
//   `enabled` defaults to TRUE while the module list is still loading. The
//   opposite default would blink every add-flow off on each page load, which
//   reads as the feature having been removed.

import type { ModuleInfo } from '@kroma/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AdminKitProvider } from './context';
import { useEnabledEngines, useModuleEnabled } from './engines';

/** A provider whose `client.modules()` answers `modules`. Retries off so a
 *  rejected fetch settles once rather than backing off through the test. */
function wrapper(modules: ModuleInfo[] | (() => Promise<ModuleInfo[]>)) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const client = {
    modules: typeof modules === 'function' ? modules : vi.fn(async () => modules),
  };
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AdminKitProvider value={{ client, user: null, apiBase: '' } as never}>
        {children}
      </AdminKitProvider>
    </QueryClientProvider>
  );
}

const mod = (over: Partial<ModuleInfo> & { id: string }): ModuleInfo =>
  ({ enabled: true, provides: [], ...over }) as ModuleInfo;

const cap = (kind: string, over: Record<string, unknown> = {}) =>
  ({ kind, fields: [{ key: 'url', label: 'field.url', type: 'text' }], ...over }) as never;

describe('useEnabledEngines', () => {
  it('offers an enabled module that provides the kind', async () => {
    const { result } = renderHook(() => useEnabledEngines('download-client'), {
      wrapper: wrapper([mod({ id: 'transmission', provides: [cap('download-client')] })]),
    });
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]?.kind).toBe('download-client');
  });

  it('drops a disabled module, so its add-flow disappears from the page', async () => {
    const { result } = renderHook(() => useEnabledEngines('download-client'), {
      wrapper: wrapper([
        mod({ id: 'off', enabled: false, provides: [cap('download-client')] }),
        mod({ id: 'on', provides: [cap('download-client')] }),
      ]),
    });
    await waitFor(() => expect(result.current).toHaveLength(1));
  });

  it('ignores capabilities of a different kind', async () => {
    const { result } = renderHook(() => useEnabledEngines('indexer-engine'), {
      wrapper: wrapper([mod({ id: 'a', provides: [cap('download-client')] })]),
    });
    await waitFor(() => expect(result.current).toHaveLength(0));
  });

  it('skips a capability with nothing to add', async () => {
    const { result } = renderHook(() => useEnabledEngines('download-client'), {
      wrapper: wrapper([
        // The embedded always-on engine: it PROVIDES the capability but has no
        // form and no flow, so an add-picker entry would open an empty modal.
        mod({ id: 'rqbit', provides: [cap('download-client', { fields: [] })] }),
      ]),
    });
    await waitFor(() => expect(result.current).toHaveLength(0));
  });

  it('accepts a custom flow in place of a field form', async () => {
    const { result } = renderHook(() => useEnabledEngines('indexer-engine'), {
      wrapper: wrapper([
        // The Cardigann definition picker has no `fields` - its whole add-flow
        // is bespoke - and must still be offered.
        mod({
          id: 'cardigann',
          provides: [cap('indexer-engine', { fields: [], flow: 'cardigann' })],
        }),
      ]),
    });
    await waitFor(() => expect(result.current).toHaveLength(1));
  });

  it('gathers every provider of the kind across modules', async () => {
    const { result } = renderHook(() => useEnabledEngines('download-client'), {
      wrapper: wrapper([
        mod({ id: 'a', provides: [cap('download-client')] }),
        mod({ id: 'b', provides: [cap('download-client'), cap('indexer-engine')] }),
      ]),
    });
    await waitFor(() => expect(result.current).toHaveLength(2));
  });

  it('is empty rather than throwing before the module list arrives', () => {
    const never = () => new Promise<ModuleInfo[]>(() => {});
    const { result } = renderHook(() => useEnabledEngines('download-client'), {
      wrapper: wrapper(never),
    });
    expect(result.current).toEqual([]);
  });
});

describe('useModuleEnabled', () => {
  it('reports a module that is on', async () => {
    const { result } = renderHook(() => useModuleEnabled('torrents'), {
      wrapper: wrapper([mod({ id: 'torrents' })]),
    });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('reports a module that is off', async () => {
    const { result } = renderHook(() => useModuleEnabled('torrents'), {
      wrapper: wrapper([mod({ id: 'torrents', enabled: false })]),
    });
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('assumes enabled while the list is still loading', () => {
    const never = () => new Promise<ModuleInfo[]>(() => {});
    const { result } = renderHook(() => useModuleEnabled('torrents'), {
      wrapper: wrapper(never),
    });
    // Defaulting to false here would blink every gated feature off on each page
    // load, which reads as the feature having been removed.
    expect(result.current).toBe(true);
  });

  it('assumes enabled for a module it has never heard of', async () => {
    const { result } = renderHook(() => useModuleEnabled('unknown'), {
      wrapper: wrapper([mod({ id: 'torrents' })]),
    });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('treats a module with no explicit flag as enabled', async () => {
    const { result } = renderHook(() => useModuleEnabled('torrents'), {
      wrapper: wrapper([{ id: 'torrents', provides: [] } as never]),
    });
    await waitFor(() => expect(result.current).toBe(true));
  });
});
