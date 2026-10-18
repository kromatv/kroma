// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerfProvider, usePerfSampler } from './perf-provider';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('app-owned performance recording', () => {
  it('keeps samples and recording lifetimes separate between roots', () => {
    let next = 0;
    vi.stubGlobal('requestAnimationFrame', () => ++next);
    const cancel = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancel);
    const a = renderHook(usePerfSampler, { wrapper: PerfProvider });
    const b = renderHook(usePerfSampler, { wrapper: PerfProvider });
    const first = a.result.current;
    const second = b.result.current;
    if (!first || !second) throw new Error('provider did not supply a recorder');
    first.markGridFocus(1, 2);
    second.markGridFocus(3, 4);
    first.startPerf();
    second.startPerf();
    expect(first.perfReport().gridCell).toBe('1,2');
    expect(second.perfReport().gridCell).toBe('3,4');
    a.unmount();
    expect(cancel).toHaveBeenCalledWith(1);
    expect(first.perfRunning()).toBe(false);
    expect(second.perfRunning()).toBe(true);
    b.unmount();
    expect(cancel).toHaveBeenCalledWith(2);
  });

  it('exposes the benchmark API only for the lifetime of an opted-in root', () => {
    const previous = { owner: 'another tool' };
    vi.stubGlobal('KROMA_PERF', previous);
    function Debug({ children }: { children: ReactNode }) {
      return <PerfProvider debug>{children}</PerfProvider>;
    }
    const root = renderHook(usePerfSampler, { wrapper: Debug });
    expect(Reflect.get(globalThis, 'KROMA_PERF')).toMatchObject({
      report: root.result.current?.perfReport,
      start: root.result.current?.startPerf,
    });
    root.unmount();
    expect(Reflect.get(globalThis, 'KROMA_PERF')).toBe(previous);
  });

  it('leaves standalone controls outside a recorder uninstrumented', () => {
    expect(renderHook(usePerfSampler).result.current).toBeNull();
  });
});
