import { act, renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import { controlOrder } from '#ui/components/organisms/player/lib/nav';
import { WEB_FLAGS } from '#ui/components/organisms/player/types';
import type { RemoteKey } from '#ui/lib/remote-keys';
import { type PlayerNavActions, usePlayerNav } from './use-player-nav';

export function makeActions(over: Partial<PlayerNavActions> = {}): PlayerNavActions {
  return {
    togglePlay: vi.fn(),
    seekNudge: vi.fn(),
    onNext: vi.fn(),
    hasNext: false,
    sheetHasItems: true,
    volumeNudge: vi.fn(),
    toggleMute: vi.fn(),
    togglePip: vi.fn(),
    toggleFullscreen: vi.fn(),
    onCast: vi.fn(),
    onExit: vi.fn(),
    ...over,
  };
}

export function nav(flags = WEB_FLAGS, playing = false, actions: PlayerNavActions = makeActions()) {
  const view = renderHook(() =>
    usePlayerNav(playing, actions, controlOrder(flags, actions.hasNext)),
  );
  const key = (k: RemoteKey) => act(() => view.result.current.handleKey(k));
  const tab = (backwards = false) => act(() => view.result.current.walkChrome(backwards));
  return { ...view, actions, key, tab };
}
