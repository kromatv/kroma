// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCreateKids } from './create-kids.hook';

function host(createKids: (draft: unknown) => Promise<unknown>) {
  return {
    createKids,
    refusal: (error: unknown) => `refused: ${String(error)}`,
    onCreated: vi.fn(),
  };
}

describe('sending a Kids form', () => {
  it('sends the draft the form makes, then says it was made', async () => {
    const lent = host(() => Promise.resolve({}));
    const createKids = vi.spyOn(lent, 'createKids');
    const { result } = renderHook(() => useCreateKids(lent));

    await act(() => result.current.create({ name: ' Léo ', level: 7 }));

    expect(createKids).toHaveBeenCalledWith({ username: 'Léo', level: 7, libraries: null });
    expect(lent.onCreated).toHaveBeenCalledOnce();
    expect(result.current.error).toBeNull();
  });

  it('sends nothing while the form has no name or no level', async () => {
    const lent = host(() => Promise.resolve({}));
    const createKids = vi.spyOn(lent, 'createKids');
    const { result } = renderHook(() => useCreateKids(lent));

    await act(() => result.current.create({ name: 'Léo', level: null }));

    expect(createKids).not.toHaveBeenCalled();
  });

  it('shows the refusal and stays on the form', async () => {
    const lent = host(() => Promise.reject(new Error('taken')));
    const { result } = renderHook(() => useCreateKids(lent));

    await act(() => result.current.create({ name: 'Léo', level: 0 }));

    expect(result.current.error).toBe('refused: Error: taken');
    expect(result.current.busy).toBe(false);
    expect(lent.onCreated).not.toHaveBeenCalled();
  });
});
