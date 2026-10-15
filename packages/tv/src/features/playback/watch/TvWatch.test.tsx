// @vitest-environment jsdom

import type { WatchableTarget, WatchNext, WatchReady, WatchStage } from '@kromatv/core';
import { DOWNLOAD, PROBE, TARGET, TICKET } from '@kromatv/core/test';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Handed {
  onBack?: () => void;
  onCancel?: () => void;
  onClose?: () => void;
  onPlayNext?: (next: WatchNext) => void;
}

const at = vi.hoisted(() => ({
  back: vi.fn(),
  swap: vi.fn(),
  cancel: vi.fn(async () => true),
  refresh: vi.fn(),
  stage: null as unknown,
  playable: null as unknown,
  target: null as unknown,
  preparation: {} as Handed,
  player: {} as Handed,
}));

vi.mock('#tv/app/providers/watchable', () => ({
  useWatchable: () => ({
    sources: [],
    source: { mount: '/api/module/tv.example.swarm', label: 'Torrents', figures: [], actions: [] },
    choose: vi.fn(),
    api: { cancel: at.cancel },
    refresh: at.refresh,
  }),
}));
vi.mock('#tv/app/router', () => ({
  useClient: () => ({ media: { artwork: { resolve: () => null } } }),
  useNav: () => ({ back: at.back, swap: at.swap }),
  useParams: () => ({ subject: { kind: 'download', downloadId: 'dl', file: 5 }, poster: null }),
}));
vi.mock('@kromatv/core/react', async (real) => ({
  ...(await real<typeof import('@kromatv/core/react')>()),
  useWatchSubject: () => ({
    stage: at.stage,
    playable: at.playable,
    progress: null,
    target: at.target,
  }),
}));
vi.mock('@kromatv/ui/kit', async (real) => ({
  ...(await real<typeof import('@kromatv/ui/kit')>()),
  Preparation: (props: Handed) => {
    at.preparation = props;
    return null;
  },
  useFocusNav: () => undefined,
}));
vi.mock('#tv/features/playback/watch/TvWatchPlayer', () => ({
  TvWatchPlayer: (props: Handed) => {
    at.player = props;
    return null;
  },
}));

import { TvWatch } from '#tv/features/playback/watch/TvWatch';

const STARTED_TO_WATCH: WatchableTarget = {
  entry: { ...TARGET.entry, ephemeral: true },
  file: TARGET.file,
};

const WAITING: WatchStage = {
  stage: 'buffering',
  release: null,
  downloadId: DOWNLOAD,
  target: STARTED_TO_WATCH,
};

const READY: WatchReady = {
  stage: 'ready',
  release: null,
  downloadId: DOWNLOAD,
  target: STARTED_TO_WATCH,
  probe: PROBE,
  ticket: TICKET,
};

beforeEach(() => {
  vi.clearAllMocks();
  at.stage = WAITING;
  at.playable = null;
  at.target = STARTED_TO_WATCH;
});

afterEach(() => cleanup());

describe('leaving a film that is still arriving', () => {
  it('goes back from the wait without erasing the download', () => {
    render(<TvWatch />);

    at.preparation.onBack?.();

    expect(at.back).toHaveBeenCalledTimes(1);
    expect(at.cancel).not.toHaveBeenCalled();
  });

  it('erases the download it was waiting on only when the viewer cancels', async () => {
    render(<TvWatch />);

    await act(async () => at.preparation.onCancel?.());

    expect(at.cancel).toHaveBeenCalledWith(DOWNLOAD);
    expect(at.refresh).toHaveBeenCalledTimes(1);
    expect(at.back).toHaveBeenCalledTimes(1);
  });

  it('closes the player without erasing the download, which the cache keeps', () => {
    at.stage = READY;
    at.playable = READY;
    render(<TvWatch />);

    at.player.onClose?.();

    expect(at.back).toHaveBeenCalledTimes(1);
    expect(at.cancel).not.toHaveBeenCalled();
  });

  it('swaps itself for the next episode the player offers', () => {
    at.stage = READY;
    at.playable = READY;
    render(<TvWatch />);
    const next: WatchNext = {
      season: 1,
      episode: 3,
      title: null,
      stillUrl: null,
      runtimeMin: null,
      subject: { kind: 'download', downloadId: DOWNLOAD, file: 6 },
    };

    at.player.onPlayNext?.(next);

    expect(at.swap).toHaveBeenCalledWith('watch', { subject: next.subject, poster: null });
  });
});
