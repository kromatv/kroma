// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PlayerKeysParams } from '#ui/components/organisms/player/lib/player-keys';
import { usePlayerKeys } from './use-player-keys';

function player(active: boolean) {
  const togglePlay = vi.fn();
  const params = {
    active,
    nav: { poke: vi.fn() },
    controller: { togglePlay },
    flags: { volume: false, pip: false, fullscreen: false, pointer: false },
  } as unknown as PlayerKeysParams;
  return { params, togglePlay };
}

function pressSpace(): boolean {
  let notPrevented = true;
  act(() => {
    notPrevented = window.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }),
    );
  });
  return notPrevented;
}

describe('an inactive player on the web', () => {
  it('leaves every key to the page in front of it', () => {
    const { params, togglePlay } = player(false);
    const { unmount } = renderHook(() => usePlayerKeys(params));

    const notPrevented = pressSpace();

    expect(togglePlay).not.toHaveBeenCalled();
    expect(notPrevented).toBe(true);
    unmount();
  });

  it('takes the keys back once it is active again', () => {
    const { params, togglePlay } = player(false);
    const { rerender, unmount } = renderHook((p: PlayerKeysParams) => usePlayerKeys(p), {
      initialProps: params,
    });

    rerender({ ...params, active: true });
    pressSpace();

    expect(togglePlay).toHaveBeenCalledOnce();
    unmount();
  });
});
