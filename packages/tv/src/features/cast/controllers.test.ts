// @vitest-environment jsdom
import { type CastController, ControllerId } from '@kromatv/client/cast';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  CastControllerStoreProvider,
  createCastControllerStore,
  useCastControllers,
} from '#tv/features/cast/controllers';

const remote = (id: string, name = id): CastController => ({
  id: ControllerId.parse(id),
  name,
  username: 'max',
});

describe('the remotes driving this TV', () => {
  it('reports only the ones that just arrived', () => {
    const store = createCastControllerStore();
    expect(store.setCastControllers([remote('a')])).toEqual([remote('a')]);
    // The row came again because something else about the set changed.
    expect(store.setCastControllers([remote('a'), remote('b')])).toEqual([remote('b')]);
    expect(store.setCastControllers([remote('a'), remote('b')])).toEqual([]);
    // One left; the other is not news.
    expect(store.setCastControllers([remote('b')])).toEqual([]);
  });

  it('shows the top bar the current list', () => {
    const store = createCastControllerStore();
    const { result } = renderHook(() => useCastControllers(), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(CastControllerStoreProvider, { value: store }, children),
    });
    expect(result.current).toEqual([]);

    act(() => {
      store.setCastControllers([remote('a', 'iPhone')]);
    });
    expect(result.current).toEqual([remote('a', 'iPhone')]);

    act(() => {
      store.setCastControllers([]);
    });
    expect(result.current).toEqual([]);
  });

  it('hangs up through the receiver socket', () => {
    const store = createCastControllerStore();
    const send = vi.fn();
    store.setCastUplink(send);
    store.kickCastController(ControllerId.parse('a'));
    expect(send).toHaveBeenCalledWith({ type: 'cast.kick', controllerId: 'a' });
  });

  it('says nothing when the socket is gone, and forgets who was driving', () => {
    const store = createCastControllerStore();
    const send = vi.fn();
    store.setCastUplink(send);
    store.setCastControllers([remote('a')]);

    store.setCastUplink(null);
    store.kickCastController(ControllerId.parse('a'));
    expect(send).not.toHaveBeenCalled();
    // The server dropped this receiver with its socket, so the same remote
    // coming back is a fresh arrival - and worth announcing again.
    expect(store.setCastControllers([remote('a')])).toEqual([remote('a')]);
  });
});

it('keeps rosters and sockets isolated between mounted roots', () => {
  const a = createCastControllerStore();
  const b = createCastControllerStore();
  const sendA = vi.fn();
  const sendB = vi.fn();
  a.setCastUplink(sendA);
  b.setCastUplink(sendB);
  a.setCastControllers([remote('a')]);
  b.setCastControllers([remote('b')]);
  a.setCastUplink(null);
  expect(a.read()).toEqual([]);
  expect(b.read()).toEqual([remote('b')]);
  b.kickCastController(ControllerId.parse('b'));
  expect(sendA).not.toHaveBeenCalled();
  expect(sendB).toHaveBeenCalledWith({ type: 'cast.kick', controllerId: 'b' });
});
