// @vitest-environment jsdom
import type { MediaItem } from '@kromatv/client/media';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({
  back: vi.fn(),
  home: vi.fn(),
  go: vi.fn(),
  swap: vi.fn(),
}));
const dock = vi.hoisted(() => ({ docked: null, dock: vi.fn(), undock: vi.fn() }));
vi.mock('#tv/app/router', () => ({ useNav: () => nav }));
vi.mock('#tv/app/playerDock', () => ({ usePlayerDock: () => dock }));

import { useDockedPlayer } from './use-docked-player';

const film = (id: string) => ({ id }) as MediaItem;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('a player on screen', () => {
  it('docks itself and goes back when its window opens', () => {
    const { result } = renderHook(() => useDockedPlayer(film('a'), false));

    result.current.onPipStart();

    expect(dock.dock).toHaveBeenCalledWith(film('a'), nav.back);
  });

  it('moves through the stack to leave or change title', () => {
    const { result } = renderHook(() => useDockedPlayer(film('a'), false));

    result.current.leave();
    result.current.home();
    result.current.swap(film('b'));

    expect(nav.back).toHaveBeenCalledOnce();
    expect(nav.home).toHaveBeenCalledOnce();
    expect(nav.swap).toHaveBeenCalledWith('player', { item: film('b') });
    expect(dock.undock).not.toHaveBeenCalled();
  });

  it('ignores a window closing', () => {
    const { result } = renderHook(() => useDockedPlayer(film('a'), false));

    result.current.onPipStop(true);

    expect(nav.go).not.toHaveBeenCalled();
    expect(dock.undock).not.toHaveBeenCalled();
  });
});

describe('a docked player', () => {
  it('comes back to the front when its window closes on a playing film', () => {
    const { result } = renderHook(() => useDockedPlayer(film('a'), true));

    result.current.onPipStop(true);

    expect(nav.go).toHaveBeenCalledWith('player', { item: film('a') });
    expect(dock.undock).not.toHaveBeenCalled();
  });

  it('ends the session when its window is dismissed', () => {
    const { result } = renderHook(() => useDockedPlayer(film('a'), true));

    result.current.onPipStop(false);

    expect(dock.undock).toHaveBeenCalledOnce();
    expect(nav.go).not.toHaveBeenCalled();
  });

  it('ends the session instead of touching the screen being browsed', () => {
    const { result } = renderHook(() => useDockedPlayer(film('a'), true));

    result.current.leave();
    result.current.home();
    result.current.swap(film('b'));

    expect(dock.undock).toHaveBeenCalledTimes(3);
    expect(nav.back).not.toHaveBeenCalled();
    expect(nav.home).not.toHaveBeenCalled();
    expect(nav.swap).not.toHaveBeenCalled();
  });
});
