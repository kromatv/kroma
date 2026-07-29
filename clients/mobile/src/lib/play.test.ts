// @vitest-environment jsdom
// Where Play lands, which is the whole of what being "connected to a TV" means
// on this phone. Getting it wrong is the bug that makes casting feel broken:
// the bar says "Playing on Salon" and the film starts in your hand.

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.hoisted(() => vi.fn());
vi.mock('expo-router', () => ({ useRouter: () => ({ push }) }));

const cast = vi.hoisted(() => ({
  active: null as { id: string; name: string } | null,
  playOn: vi.fn(async () => true),
}));
vi.mock('@kroma/ui', () => ({ useCast: () => cast }));

const { usePlay } = await import('./play');

beforeEach(() => {
  push.mockClear();
  cast.playOn.mockClear().mockResolvedValue(true);
  cast.active = null;
});

describe('with no TV connected', () => {
  it('opens this phone’s player', async () => {
    const { result } = renderHook(() => usePlay());
    expect(result.current.device).toBeNull();

    await result.current.play('item-1');

    expect(cast.playOn).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/player/item-1');
  });
});

describe('while driving a TV', () => {
  beforeEach(() => {
    cast.active = { id: 'tv-salon-01', name: 'Salon' };
  });

  it('starts the title THERE and opens the remote', async () => {
    const { result } = renderHook(() => usePlay());
    expect(result.current.device?.name).toBe('Salon');

    await result.current.play('item-1', 42_000);

    expect(cast.playOn).toHaveBeenCalledWith('tv-salon-01', 'item-1', 42_000);
    // The viewer just started something on another screen; this is where they
    // say what happens to it next.
    expect(push).toHaveBeenCalledWith('/cast');
    expect(push).not.toHaveBeenCalledWith('/player/item-1');
  });

  it('resumes from the account’s own position when none is given', async () => {
    const { result } = renderHook(() => usePlay());
    await result.current.play('item-1');
    expect(cast.playOn).toHaveBeenCalledWith('tv-salon-01', 'item-1', 0);
  });

  it('plays here when the set refuses, rather than doing nothing at all', async () => {
    // Switched off since the roster was drawn, or it let this remote go. The tap
    // used to be inert: no navigation, no message, and no screen on the phone
    // that reads `Cast.error`.
    cast.playOn.mockResolvedValue(false);
    const { result } = renderHook(() => usePlay());

    await result.current.play('item-1');

    expect(push).toHaveBeenCalledWith('/player/item-1');
    expect(push).not.toHaveBeenCalledWith('/cast');
  });
});
