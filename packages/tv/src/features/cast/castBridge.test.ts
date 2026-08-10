// @vitest-environment jsdom
import type { MediaItem, Translate } from '@kroma/core';
import type { PlayerController, PlayerSub } from '@kroma/ui';
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  castReport,
  castTarget,
  onCastReportChange,
  requestCastSeek,
  setCastTarget,
  useCastTarget,
} from './castBridge';

const t = ((key: string) => key) as unknown as Translate;
const item = { id: 'm1' } as MediaItem;
const other = { id: 'm2' } as MediaItem;

function controller(over: Partial<PlayerController> = {}): PlayerController {
  return {
    cur: 0,
    dur: 0,
    playing: false,
    waiting: false,
    ready: false,
    audioTracks: [],
    audioIndex: 0,
    subtitles: [],
    subtitleIndex: null,
    seekTo: () => {},
    ...over,
  } as unknown as PlayerController;
}

const sub = (over: Partial<PlayerSub>): PlayerSub =>
  ({ index: 0, selectable: true, ai: false, label: null, language: null, ...over }) as PlayerSub;

const microtask = () => new Promise<void>((resolve) => queueMicrotask(resolve));

afterEach(() => {
  cleanup();
  setCastTarget(null);
  requestCastSeek('m1', 0);
  requestCastSeek('m2', 0);
});

describe('castReport', () => {
  it('is null while no player is running', () => {
    expect(castReport(t)).toBeNull();
    expect(castTarget()).toBeNull();
  });

  it('reports the position in whole milliseconds and the duration when known', () => {
    setCastTarget({ item, controller: controller({ cur: 12.3456, dur: 100, playing: true }) });
    expect(castReport(t)).toMatchObject({
      itemId: 'm1',
      positionMs: 12346,
      durationMs: 100000,
      state: 'playing',
    });
  });

  it('reports no duration for a stream whose length is not known yet', () => {
    setCastTarget({ item, controller: controller({ cur: -1, dur: 0 }) });
    expect(castReport(t)).toMatchObject({ positionMs: 0, durationMs: null, state: 'paused' });
  });

  it('reports a stalled player as buffering, so the sender keeps its pause button', () => {
    setCastTarget({ item, controller: controller({ playing: true, waiting: true }) });
    expect(castReport(t)?.state).toBe('buffering');
  });

  it('numbers an audio track that names nothing rather than offering a blank row', () => {
    setCastTarget({
      item,
      controller: controller({
        audioIndex: 1,
        audioTracks: [
          { index: 1, codec: 'eac3', channels: 6, language: 'fr' },
          { index: 2, codec: '', channels: null, language: null },
        ] as PlayerController['audioTracks'],
      }),
    });
    const report = castReport(t);
    expect(report?.audioIndex).toBe(1);
    expect(report?.audioTracks?.[0]).toMatchObject({ index: 1 });
    expect(report?.audioTracks?.[0]?.label).toContain('EAC3');
    expect(report?.audioTracks?.[1]).toEqual({ index: 2, label: '#2' });
  });

  it('offers only the subtitles this player can actually switch to', () => {
    setCastTarget({
      item,
      controller: controller({
        subtitleIndex: 1,
        subtitles: [
          sub({ index: 0, ai: true, label: 'Auto FR', language: 'fr' }),
          sub({ index: 1, label: 'ignored', language: 'en' }),
          sub({ index: 2 }),
          sub({ index: 3, selectable: false, language: 'de' }),
        ],
      }),
    });
    const report = castReport(t);
    expect(report?.subtitleIndex).toBe(1);
    expect(report?.subtitles).toEqual([
      { index: 0, label: 'Auto FR' },
      { index: 1, label: 'lang.en' },
      { index: 2, label: 'player.langUnknown' },
    ]);
  });

  it('leaves the subtitle index out entirely when subtitles are off', () => {
    setCastTarget({ item, controller: controller({ subtitleIndex: null }) });
    expect(castReport(t)?.subtitleIndex).toBeUndefined();
  });
});

describe('onCastReportChange', () => {
  it('fires on a material change and stays silent on the position ticking', async () => {
    const seen = vi.fn();
    const off = onCastReportChange(seen);

    setCastTarget({ item, controller: controller({ playing: true }) });
    await microtask();
    expect(seen).toHaveBeenCalledTimes(1);

    setCastTarget({ item, controller: controller({ playing: true, cur: 41.5 }) });
    await microtask();
    expect(seen).toHaveBeenCalledTimes(1);

    setCastTarget({ item, controller: controller({ playing: false }) });
    await microtask();
    expect(seen).toHaveBeenCalledTimes(2);

    off();
    setCastTarget({ item, controller: controller({ playing: true }) });
    await microtask();
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it('collapses the player re-registering itself into a single notification', async () => {
    const seen = vi.fn();
    const off = onCastReportChange(seen);
    setCastTarget({ item, controller: controller({ playing: true }) });
    await microtask();
    seen.mockClear();

    setCastTarget(null);
    setCastTarget({ item, controller: controller({ playing: true }) });
    await microtask();
    expect(seen).not.toHaveBeenCalled();
    off();
  });
});

describe('useCastTarget', () => {
  it('registers the running player and clears it on unmount', () => {
    const { unmount } = renderHook(() => useCastTarget(item, controller()));
    expect(castTarget()?.item.id).toBe('m1');
    unmount();
    expect(castTarget()).toBeNull();
  });

  it('applies a cast position once the engine reports ready, exactly once', () => {
    const seekTo = vi.fn();
    requestCastSeek('m1', 30_000);
    const { rerender } = renderHook(
      ({ ready }) => useCastTarget(item, controller({ ready, seekTo })),
      {
        initialProps: { ready: false },
      },
    );
    expect(seekTo).not.toHaveBeenCalled();

    rerender({ ready: true });
    expect(seekTo).toHaveBeenCalledWith(30);

    rerender({ ready: false });
    rerender({ ready: true });
    expect(seekTo).toHaveBeenCalledTimes(1);
  });

  it('leaves a position meant for another title alone', () => {
    const seekTo = vi.fn();
    requestCastSeek('m2', 30_000);
    renderHook(() => useCastTarget(item, controller({ ready: true, seekTo })));
    expect(seekTo).not.toHaveBeenCalled();

    const otherSeek = vi.fn();
    renderHook(() => useCastTarget(other, controller({ ready: true, seekTo: otherSeek })));
    expect(otherSeek).toHaveBeenCalledWith(30);
  });

  it('treats a cast from the start as nothing to restore', () => {
    const seekTo = vi.fn();
    requestCastSeek('m1', 0);
    renderHook(() => useCastTarget(item, controller({ ready: true, seekTo })));
    expect(seekTo).not.toHaveBeenCalled();
  });
});
