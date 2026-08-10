// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const H = vi.hoisted(() => ({
  order: [] as string[],
  polls: [] as { key: readonly unknown[]; fn: () => Promise<unknown>; intervalMs: number }[],
  modules: null as unknown,
  catalog: null as unknown,
  setModuleEnabled: vi.fn(),
}));

vi.mock('#web/features/admin/hooks', () => ({
  usePoll: (key: readonly unknown[], fn: () => Promise<unknown>, intervalMs: number) => {
    H.polls.push({ key, fn, intervalMs });
    const catalog = key.includes('catalog');
    return {
      data: catalog ? H.catalog : H.modules,
      reload: () => H.order.push(catalog ? 'catalog' : 'modules'),
    };
  },
}));

vi.mock('#web/modules/ModuleHostProvider', () => ({
  useRefreshModules: () => async () => {
    H.order.push('host');
  },
}));

vi.mock('#web/features/admin/module-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#web/features/admin/module-api')>()),
  setModuleEnabled: H.setModuleEnabled,
}));

const { fetchAdminModules, fetchStoreCatalog } = await import('#web/features/admin/module-api');
const { useModuleData, useModuleToggle } = await import('#web/features/admin/module-data');

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => {
  H.order = [];
  H.polls = [];
  H.modules = null;
  H.catalog = null;
  H.setModuleEnabled.mockReset();
});

afterEach(() => cleanup());

describe('useModuleData', () => {
  it('polls the installed modules often and the store catalog rarely', () => {
    H.modules = [{ id: 'tv.kroma.vpn' }];
    H.catalog = { modules: [] };
    const { result } = renderHook(() => useModuleData());

    expect(H.polls[0]).toMatchObject({ key: ['admin', 'modules'], intervalMs: 30000 });
    expect(H.polls[0]?.fn).toBe(fetchAdminModules);
    expect(H.polls[1]).toMatchObject({
      key: ['admin', 'store', 'catalog'],
      intervalMs: 300000,
    });
    expect(H.polls[1]?.fn).toBe(fetchStoreCatalog);
    expect(result.current.modules).toBe(H.modules);
    expect(result.current.catalog).toBe(H.catalog);
  });

  it('re-snapshots the module host before reloading either list', async () => {
    const { result } = renderHook(() => useModuleData());
    await act(async () => {
      await result.current.refreshAll();
    });
    expect(H.order).toEqual(['host', 'modules', 'catalog']);
  });

  it('exposes each list reload on its own', () => {
    const { result } = renderHook(() => useModuleData());
    act(() => result.current.reload());
    act(() => result.current.reloadCatalog());
    expect(H.order).toEqual(['modules', 'catalog']);
  });
});

describe('useModuleToggle', () => {
  it("surfaces the server's start warning and reports done", async () => {
    const onDone = vi.fn();
    H.setModuleEnabled.mockResolvedValue({ id: 'x', enabled: true, warning: 'sidecar died' });
    const { result } = renderHook(() => useModuleToggle('x', onDone));

    await act(async () => {
      await result.current.toggle(true);
    });
    expect(H.setModuleEnabled).toHaveBeenCalledWith('x', true);
    expect(result.current.error).toBe('sidecar died');
    expect(result.current.busy).toBe(false);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('clears the error on a clean toggle, with no onDone to call', async () => {
    H.setModuleEnabled.mockResolvedValue({ id: 'x', enabled: false });
    const { result } = renderHook(() => useModuleToggle('x'));
    await act(async () => {
      await result.current.toggle(false);
    });
    expect(result.current.error).toBeNull();
  });

  it('reports the request failure as the error', async () => {
    const onDone = vi.fn();
    H.setModuleEnabled.mockRejectedValue(new Error('module is running'));
    const { result } = renderHook(() => useModuleToggle('x', onDone));
    await act(async () => {
      await result.current.toggle(true);
    });
    expect(result.current.error).toBe('module is running');
    expect(result.current.busy).toBe(false);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('is busy while the request is in flight', async () => {
    let settle: (r: unknown) => void = () => undefined;
    H.setModuleEnabled.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    const { result } = renderHook(() => useModuleToggle('x'));
    act(() => {
      void result.current.toggle(true);
    });
    expect(result.current.busy).toBe(true);

    await act(async () => {
      settle({ id: 'x', enabled: true });
      await tick();
    });
    expect(result.current.busy).toBe(false);
  });
});
