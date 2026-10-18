// @vitest-environment jsdom
import { ItemId } from '@kromatv/client/media';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { WebRuntimeProvider } from './web-runtime';
import { createWebTestRuntime } from './web-runtime.fixture';

const shared = vi.fn((client: unknown, itemId: string, opts?: unknown) => ({
  client,
  itemId,
  opts,
}));
vi.mock('@kromatv/ui', () => ({ useStoryboard: shared }));
const { useStoryboard } = await import('./use-storyboard');

function root() {
  const runtime = createWebTestRuntime({});
  const wrapper = ({ children }: Readonly<{ children: ReactNode }>) =>
    createElement(WebRuntimeProvider, { value: runtime }, children);
  return { runtime, wrapper };
}
describe('useStoryboard', () => {
  it('keeps the router client stable while a bearer changes', () => {
    const owner = root();
    const { rerender } = renderHook(() => useStoryboard(ItemId.parse('item-1')), {
      wrapper: owner.wrapper,
    });
    expect(shared.mock.calls.at(-1)?.[0]).toBe(owner.runtime.client);
    owner.runtime.client.setAuthToken('fresh');
    rerender();
    expect(shared.mock.calls.at(-1)?.[0]).toBe(owner.runtime.client);
  });
  it('keeps independent roots on their own clients', () => {
    const a = root();
    const b = root();
    renderHook(() => useStoryboard(ItemId.parse('item-1')), { wrapper: a.wrapper });
    renderHook(() => useStoryboard(ItemId.parse('item-1')), { wrapper: b.wrapper });
    expect(a.runtime.client).not.toBe(b.runtime.client);
  });
  it('keeps the same client after sign-out', () => {
    const owner = root();
    owner.runtime.client.setAuthToken('before');
    const { rerender } = renderHook(() => useStoryboard(ItemId.parse('item-1')), {
      wrapper: owner.wrapper,
    });
    owner.runtime.client.setAuthToken(undefined);
    rerender();
    expect(shared.mock.calls.at(-1)?.[0]).toBe(owner.runtime.client);
  });
  it('passes the requested item and options through', () => {
    const owner = root();
    renderHook(() => useStoryboard(ItemId.parse('item-9'), { generate: true }), {
      wrapper: owner.wrapper,
    });
    expect(shared).toHaveBeenLastCalledWith(owner.runtime.client, 'item-9', { generate: true });
  });
});
