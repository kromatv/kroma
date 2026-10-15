// @vitest-environment jsdom

import type { WatchStage as Stage, WatchableTarget, WatchNext, WatchReady } from '@kromatv/core';
import { DOWNLOAD, PROBE, TARGET, TICKET } from '@kromatv/core/test';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface Handed {
  onBack?: () => void;
  onCancel?: () => void;
  onLeave?: () => void;
  onPlayNext?: (next: WatchNext) => void;
}

const at = vi.hoisted(() => ({
  goBack: vi.fn(),
  replace: vi.fn(),
  cancel: vi.fn(async () => true),
  stage: null as unknown,
  playable: null as unknown,
  target: null as unknown,
  preparation: {} as Handed,
  body: {} as Handed,
}));

vi.mock('expo-keep-awake', () => ({ useKeepAwake: () => undefined }));
vi.mock('expo-router', () => ({ useRouter: () => ({ replace: at.replace }) }));
vi.mock('#mobile/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('#mobile/lib/nav', () => ({ goBack: at.goBack }));
vi.mock('#mobile/lib/session', () => ({
  useClient: () => ({ media: { artwork: { resolve: () => null } } }),
}));
vi.mock('#mobile/lib/watchable', async (real) => ({
  ...(await real<typeof import('#mobile/lib/watchable')>()),
  useWatchable: () => ({
    sources: [],
    source: { mount: '/api/module/tv.example.swarm', label: 'Torrents', figures: [], actions: [] },
    choose: vi.fn(),
    api: { cancel: at.cancel },
  }),
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
}));
vi.mock('#mobile/player/WatchBody', () => ({
  WatchBody: (props: Handed) => {
    at.body = props;
    return null;
  },
}));

import { WatchStage } from '#mobile/player/WatchStage';

const STARTED_TO_WATCH: WatchableTarget = {
  entry: { ...TARGET.entry, ephemeral: true },
  file: TARGET.file,
};

const WAITING: Stage = {
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

const SUBJECT = { kind: 'download', downloadId: DOWNLOAD, file: 5 } as const;

beforeEach(() => {
  vi.clearAllMocks();
  at.stage = WAITING;
  at.playable = null;
  at.target = STARTED_TO_WATCH;
});

afterEach(() => cleanup());

describe('leaving a film that is still arriving', () => {
  it('goes back from the wait without erasing the download', () => {
    render(<WatchStage subject={SUBJECT} />);

    at.preparation.onBack?.();

    expect(at.goBack).toHaveBeenCalledTimes(1);
    expect(at.cancel).not.toHaveBeenCalled();
  });

  it('erases the download it was waiting on only when the viewer cancels', async () => {
    render(<WatchStage subject={SUBJECT} />);

    await act(async () => at.preparation.onCancel?.());

    expect(at.cancel).toHaveBeenCalledWith(DOWNLOAD);
    expect(at.goBack).toHaveBeenCalledTimes(1);
  });

  it('closes the player without erasing the download, which the cache keeps', () => {
    at.stage = READY;
    at.playable = READY;
    render(<WatchStage subject={SUBJECT} />);

    at.body.onLeave?.();

    expect(at.goBack).toHaveBeenCalledTimes(1);
    expect(at.cancel).not.toHaveBeenCalled();
  });

  it('moves on to the next episode through the route that plays it', () => {
    at.stage = READY;
    at.playable = READY;
    render(<WatchStage subject={SUBJECT} />);
    const next: WatchNext = {
      season: 1,
      episode: 3,
      title: null,
      stillUrl: null,
      runtimeMin: null,
      subject: { kind: 'download', downloadId: DOWNLOAD, file: 6 },
    };

    at.body.onPlayNext?.(next);

    expect(at.replace).toHaveBeenCalledWith(`/watch/${DOWNLOAD}?file=6`);
  });
});
