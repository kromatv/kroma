// @vitest-environment jsdom
//
// The server sends this TV's whole row every time anything about it changes
// (a film starting, one remote leaving), so the store must diff rather than
// announce the list it was handed.

import type { CastController } from '@kroma/core';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  kickCastController,
  setCastControllers,
  setCastUplink,
  useCastControllers,
} from '#tv/features/cast/controllers';

const remote = (id: string, name = id): CastController => ({ id, name, username: 'max' });

beforeEach(() => {
  // Also clears the roster, which is the point: module state outlives a test.
  setCastUplink(null);
});

describe('the remotes driving this TV', () => {
  it('reports only the ones that just arrived', () => {
    expect(setCastControllers([remote('a')])).toEqual([remote('a')]);
    // The row came again because something else about the set changed.
    expect(setCastControllers([remote('a'), remote('b')])).toEqual([remote('b')]);
    expect(setCastControllers([remote('a'), remote('b')])).toEqual([]);
    // One left; the other is not news.
    expect(setCastControllers([remote('b')])).toEqual([]);
  });

  it('shows the top bar the current list', () => {
    const { result } = renderHook(() => useCastControllers());
    expect(result.current).toEqual([]);

    act(() => {
      setCastControllers([remote('a', 'iPhone')]);
    });
    expect(result.current).toEqual([remote('a', 'iPhone')]);

    act(() => {
      setCastControllers([]);
    });
    expect(result.current).toEqual([]);
  });

  it('hangs up through the receiver socket', () => {
    const send = vi.fn();
    setCastUplink(send);
    kickCastController('a');
    expect(send).toHaveBeenCalledWith({ type: 'cast.kick', controllerId: 'a' });
  });

  it('says nothing when the socket is gone, and forgets who was driving', () => {
    const send = vi.fn();
    setCastUplink(send);
    setCastControllers([remote('a')]);

    setCastUplink(null);
    kickCastController('a');
    expect(send).not.toHaveBeenCalled();
    // The server dropped this receiver with its socket, so the same remote
    // coming back is a fresh arrival - and worth announcing again.
    expect(setCastControllers([remote('a')])).toEqual([remote('a')]);
  });
});
