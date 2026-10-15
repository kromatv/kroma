import type { WatchableApi, WatchableProgress } from '@kromatv/client/watchable';
import { vi } from 'vitest';

const ARRIVING: WatchableProgress = {
  progress: 0.01,
  figures: {},
  arriving: [],
  downBps: 320_000,
  upBps: 0,
  peers: 4,
  peersSeen: 11,
  pieces: [100, 0, 0],
};

export const fakeWatchable = (over: Partial<WatchableApi> = {}): WatchableApi => ({
  list: vi.fn(),
  start: vi.fn(),
  probe: vi.fn(),
  progress: vi.fn().mockResolvedValue(ARRIVING),
  ticket: vi.fn(),
  subtitleUrl: vi.fn(),
  subtitles: vi.fn(),
  storyboard: vi.fn().mockResolvedValue(null),
  cancel: vi.fn(),
  hlsMasterUrl: vi.fn(),
  ...over,
});
