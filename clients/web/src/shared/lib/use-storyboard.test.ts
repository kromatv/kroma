// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const loadSession = vi.fn<() => { accessToken: string } | null>();
const kromaClient = vi.fn(() => ({ id: Symbol('client') }));
const shared = vi.fn((client: unknown, itemId: string, opts?: unknown) => ({
  client,
  itemId,
  opts,
}));

vi.mock('@kroma/core', () => ({ loadSession: () => loadSession() }));
vi.mock('@kroma/ui', () => ({ useStoryboard: shared }));
vi.mock('#web/shared/lib/api', () => ({ kromaClient: () => kromaClient() }));

const { useStoryboard } = await import('./use-storyboard');

afterEach(() => {
  vi.clearAllMocks();
  loadSession.mockReset();
});

describe('useStoryboard', () => {
  it('keeps one client while the token holds, so the polling effect is not torn down every render', () => {
    loadSession.mockReturnValue({ accessToken: 'a' });
    const { rerender } = renderHook(() => useStoryboard('item-1'));
    rerender();
    rerender();

    expect(kromaClient).toHaveBeenCalledTimes(1);
    const seen = shared.mock.calls.map(([client]) => client);
    expect(new Set(seen).size).toBe(1);
  });

  it('mints a fresh client when the token changes, so a new session is not served by the old one', () => {
    loadSession.mockReturnValue({ accessToken: 'a' });
    const { rerender } = renderHook(() => useStoryboard('item-1'));
    loadSession.mockReturnValue({ accessToken: 'b' });
    rerender();

    expect(kromaClient).toHaveBeenCalledTimes(2);
    const [first, second] = shared.mock.calls.map(([client]) => client);
    expect(first).not.toBe(second);
  });

  it('reads a signed-out session without minting a client per render', () => {
    loadSession.mockReturnValue(null);
    const { rerender } = renderHook(() => useStoryboard('item-1'));
    rerender();

    expect(kromaClient).toHaveBeenCalledTimes(1);
  });

  it('hands the item and the options straight through', () => {
    loadSession.mockReturnValue({ accessToken: 'a' });
    renderHook(() => useStoryboard('item-9', { generate: true }));

    expect(shared).toHaveBeenCalledWith(expect.anything(), 'item-9', { generate: true });
  });
});
