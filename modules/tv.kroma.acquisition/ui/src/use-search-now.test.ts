// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSearchNow } from './use-search-now';

const toast = vi.fn();

vi.mock('@kromatv/ui/kit', () => ({ toast: (...args: unknown[]) => toast(...args) }));
vi.mock('@kromatv/client', () => ({
  apiErrorText: (error: Error, fallback: string) => error.message || fallback,
}));
vi.mock('@kromatv/module-sdk', () => {
  const t = (key: string, params?: object) => (params ? `${key} ${JSON.stringify(params)}` : key);
  return { useT: () => t };
});

beforeEach(() => toast.mockReset());

describe('a search now runner', () => {
  it('toasts a started search with the number of units, and is busy meanwhile', async () => {
    const { result } = renderHook(() => useSearchNow());

    act(() => result.current.start(() => Promise.resolve({ started: true, units: 3 })));
    expect(result.current.busy).toBe(true);

    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(toast).toHaveBeenCalledWith({
      message: 'acq.searchStarted',
      detail: 'acq.searchUnits {"count":3}',
      icon: 'search',
      tone: 'success',
    });
  });

  it('toasts a started sweep without a unit count', async () => {
    const { result } = renderHook(() => useSearchNow());

    act(() => result.current.start(() => Promise.resolve({ started: true })));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.mock.calls[0]?.[0].detail).toBeUndefined();
  });

  it('gives the reason a search did not start', async () => {
    const { result } = renderHook(() => useSearchNow());

    act(() => result.current.start(() => Promise.resolve({ started: false, reason: 'vpnClosed' })));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.mock.calls[0]?.[0]).toEqual({
      message: 'acq.searchNotStarted',
      detail: 'acq.notStarted.vpnClosed',
      icon: 'alert-triangle',
    });
  });

  it('falls back to a generic reason for one it does not know', async () => {
    const { result } = renderHook(() => useSearchNow());

    act(() => result.current.start(() => Promise.resolve({ started: false })));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.mock.calls[0]?.[0].detail).toBe('acq.notStarted.other');
  });

  it('toasts the error text when the call fails', async () => {
    const { result } = renderHook(() => useSearchNow());

    act(() => result.current.start(() => Promise.reject(new Error('down'))));

    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(toast).toHaveBeenCalledWith({ message: 'down', icon: 'alert-triangle' });
  });
});
