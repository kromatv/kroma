// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCodeEntry } from './use-code-entry.hook';

const authorize = vi.hoisted(() => vi.fn());
vi.mock('#web/shared/lib/auth', () => ({
  useAuth: () => ({ client: { accounts: { quickConnect: { authorize } } } }),
}));

beforeEach(() => {
  authorize.mockReset();
  authorize.mockResolvedValue(undefined);
});

describe('entering a television code', () => {
  it('starts from the code in the link and waits', () => {
    const { result } = renderHook(() => useCodeEntry('AB12'));

    expect(result.current).toMatchObject({ code: 'AB12', status: 'idle', busy: false });
  });

  it('sends the trimmed typed code and reports success', async () => {
    const { result } = renderHook(() => useCodeEntry(' ab12 '));

    await act(() => result.current.submit());

    expect(authorize).toHaveBeenCalledExactlyOnceWith('ab12');
    expect(result.current).toMatchObject({ status: 'ok', busy: false });
  });

  it('sends the completed value rather than the stored one', async () => {
    const { result } = renderHook(() => useCodeEntry('AB12'));

    await act(() => result.current.submit('ZZ99'));

    expect(authorize).toHaveBeenCalledExactlyOnceWith('ZZ99');
  });

  it('sends nothing for a blank code', async () => {
    const { result } = renderHook(() => useCodeEntry('  '));

    await act(() => result.current.submit());

    expect(authorize).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });

  it('reports a refused code and clears the error on the next edit', async () => {
    authorize.mockRejectedValue(new Error('no such code'));
    const { result } = renderHook(() => useCodeEntry('AB12'));
    await act(() => result.current.submit());
    expect(result.current).toMatchObject({ status: 'err', busy: false });

    act(() => result.current.edit('AB13'));

    expect(result.current).toMatchObject({ code: 'AB13', status: 'idle' });
  });
});
