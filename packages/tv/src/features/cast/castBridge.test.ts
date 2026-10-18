// @vitest-environment jsdom
import type { MediaItem } from '@kromatv/client/media';
import type { Translate } from '@kromatv/i18n';
import type { PlayerController, PlayerSub } from '@kromatv/ui';
import { cleanup, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type CastBridge, CastBridgeProvider, createCastBridge, useCastTarget } from './castBridge';

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

afterEach(cleanup);
function wrap(bridge: CastBridge) {
  return ({ children }: { children: ReactNode }) =>
    createElement(CastBridgeProvider, { value: bridge }, children);
}

describe('castReport', () => {
  it('is null while no player is running', () => {
    const bridge = createCastBridge();
    expect(bridge.castReport(t)).toBeNull();
    expect(bridge.castTarget()).toBeNull();
  });

  it('reports the position in whole milliseconds and the duration when known', () => {
    const bridge = createCastBridge();
    bridge.setCastTarget({
      item,
      controller: controller({ cur: 12.3456, dur: 100, playing: true }),
    });
    expect(bridge.castReport(t)).toMatchObject({
      itemId: 'm1',
      positionMs: 12346,
      durationMs: 100000,
      state: 'playing',
    });
  });

  it('reports no duration for a stream whose length is not known yet', () => {
    const bridge = createCastBridge();
    bridge.setCastTarget({ item, controller: controller({ cur: -1, dur: 0 }) });
    expect(bridge.castReport(t)).toMatchObject({
      positionMs: 0,
      durationMs: null,
      state: 'paused',
    });
  });

  it('reports a stalled player as buffering, so the sender keeps its pause button', () => {
    const bridge = createCastBridge();
    bridge.setCastTarget({ item, controller: controller({ playing: true, waiting: true }) });
    expect(bridge.castReport(t)?.state).toBe('buffering');
  });

  it('numbers an audio track that names nothing rather than offering a blank row', () => {
    const bridge = createCastBridge();
    bridge.setCastTarget({
      item,
      controller: controller({
        audioIndex: 1,
        audioTracks: [
          { index: 1, codec: 'eac3', channels: 6, language: 'fr' },
          { index: 2, codec: '', channels: null, language: null },
        ] as PlayerController['audioTracks'],
      }),
    });
    const report = bridge.castReport(t);
    expect(report?.audioIndex).toBe(1);
    expect(report?.audioTracks?.[0]).toMatchObject({ index: 1 });
    expect(report?.audioTracks?.[0]?.label).toContain('EAC3');
    expect(report?.audioTracks?.[1]).toEqual({ index: 2, label: '#2' });
  });

  it('offers only the subtitles this player can actually switch to', () => {
    const bridge = createCastBridge();
    bridge.setCastTarget({
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
    const report = bridge.castReport(t);
    expect(report?.subtitleIndex).toBe(1);
    expect(report?.subtitles).toEqual([
      { index: 0, label: 'Auto FR' },
      { index: 1, label: 'lang.en' },
      { index: 2, label: 'player.langUnknown' },
    ]);
  });

  it('leaves the subtitle index out entirely when subtitles are off', () => {
    const bridge = createCastBridge();
    bridge.setCastTarget({ item, controller: controller({ subtitleIndex: null }) });
    expect(bridge.castReport(t)?.subtitleIndex).toBeUndefined();
  });
});

describe('onCastReportChange', () => {
  it('fires on a material change and stays silent on the position ticking', async () => {
    const bridge = createCastBridge();
    const seen = vi.fn();
    const off = bridge.onCastReportChange(seen);

    bridge.setCastTarget({ item, controller: controller({ playing: true }) });
    await microtask();
    expect(seen).toHaveBeenCalledTimes(1);

    bridge.setCastTarget({ item, controller: controller({ playing: true, cur: 41.5 }) });
    await microtask();
    expect(seen).toHaveBeenCalledTimes(1);

    bridge.setCastTarget({ item, controller: controller({ playing: false }) });
    await microtask();
    expect(seen).toHaveBeenCalledTimes(2);

    off();
    bridge.setCastTarget({ item, controller: controller({ playing: true }) });
    await microtask();
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it('collapses the player re-registering itself into a single notification', async () => {
    const bridge = createCastBridge();
    const seen = vi.fn();
    const off = bridge.onCastReportChange(seen);
    bridge.setCastTarget({ item, controller: controller({ playing: true }) });
    await microtask();
    seen.mockClear();

    bridge.setCastTarget(null);
    bridge.setCastTarget({ item, controller: controller({ playing: true }) });
    await microtask();
    expect(seen).not.toHaveBeenCalled();
    off();
  });
});

describe('useCastTarget', () => {
  it('registers the running player and clears it on unmount', () => {
    const bridge = createCastBridge();
    const { unmount } = renderHook(() => useCastTarget(item, controller()), {
      wrapper: wrap(bridge),
    });
    expect(bridge.castTarget()?.item.id).toBe('m1');
    unmount();
    expect(bridge.castTarget()).toBeNull();
  });

  it('applies a cast position once the engine reports ready, exactly once', () => {
    const bridge = createCastBridge();
    const seekTo = vi.fn();
    bridge.requestCastSeek('m1', 30_000);
    const { rerender } = renderHook(
      ({ ready }) => useCastTarget(item, controller({ ready, seekTo })),
      {
        initialProps: { ready: false },
        wrapper: wrap(bridge),
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
    const bridge = createCastBridge();
    const seekTo = vi.fn();
    bridge.requestCastSeek('m2', 30_000);
    renderHook(() => useCastTarget(item, controller({ ready: true, seekTo })), {
      wrapper: wrap(bridge),
    });
    expect(seekTo).not.toHaveBeenCalled();

    const otherSeek = vi.fn();
    renderHook(() => useCastTarget(other, controller({ ready: true, seekTo: otherSeek })), {
      wrapper: wrap(bridge),
    });
    expect(otherSeek).toHaveBeenCalledWith(30);
  });

  it('treats a cast from the start as nothing to restore', () => {
    const bridge = createCastBridge();
    const seekTo = vi.fn();
    bridge.requestCastSeek('m1', 0);
    renderHook(() => useCastTarget(item, controller({ ready: true, seekTo })), {
      wrapper: wrap(bridge),
    });
    expect(seekTo).not.toHaveBeenCalled();
  });
});

it('isolates queued seeks, reports and notifications between televisions', async () => {
  const a = createCastBridge();
  const b = createCastBridge();
  const notifyA = vi.fn();
  const notifyB = vi.fn();
  a.onCastReportChange(notifyA);
  b.onCastReportChange(notifyB);
  a.requestCastSeek('m1', 30000);
  b.setCastTarget({ item: other, controller: controller() });
  await microtask();
  expect(notifyA).not.toHaveBeenCalled();
  expect(notifyB).toHaveBeenCalledTimes(1);
  expect(a.castReport(t)).toBeNull();
  expect(b.castReport(t)?.itemId).toBe('m2');
  expect(b.takeCastSeek('m1')).toBeNull();
  expect(a.takeCastSeek('m1')).toBe(30000);
});
