import { vi } from 'vitest';
import type { EngineListeners } from '#tv/features/playback/player/engine';

export function fakeListeners(): EngineListeners {
  return {
    onTime: vi.fn(),
    onDuration: vi.fn(),
    onBuffered: vi.fn(),
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onWaiting: vi.fn(),
    onPlaying: vi.fn(),
    onEnded: vi.fn(),
    onError: vi.fn(),
    onReady: vi.fn(),
    onAspect: vi.fn(),
    onSurfaceChange: vi.fn(),
  };
}
