// @vitest-environment jsdom

import type { MediaItem } from '@kromatv/client/media';
import { act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLIENT,
  ITEM,
  P,
  cleanupEngineFixture,
  open,
  player,
  reachReady,
  renderHook,
  resetEngineFixture,
  useFixtureEngine as useKromaEngine,
} from './engine.fixture';

beforeEach(resetEngineFixture);
afterEach(cleanupEngineFixture);

describe('playback engine lifecycle', () => {
  it('ignores delayed native readiness and controls after shutdown', async () => {
    const { result } = open(60);
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(1));
    act(() => result.current.shutdown());
    await reachReady();
    act(() => {
      result.current.togglePlay();
      result.current.seekTo(300);
      result.current.skip(10);
      result.current.setAudio(1);
      result.current.setFilter('night');
      result.current.setRate(2);
      player().emit('playingChange', { isPlaying: true });
      player().emit('timeUpdate', { currentTime: 300, bufferedPosition: 340 });
      player().emit('playToEnd', {});
    });
    expect(player().play).not.toHaveBeenCalled();
    expect(player().currentTime).toBe(0);
    expect(player().playbackRate).toBe(1);
    expect(player().muted).toBe(true);
    expect(player().staysActiveInBackground).toBe(false);
    expect(player().showNowPlayingNotification).toBe(false);
    expect(result.current.cur).toBe(60);
    expect(result.current.playing).toBe(false);
    expect(result.current.endedNonce).toBe(0);
    expect(player().replaceAsync).toHaveBeenLastCalledWith(null);
  });

  it('detaches a source that finishes replacing after shutdown already detached it', async () => {
    let finishReplace: (() => void) | undefined;
    let source: unknown = null;
    player().replaceAsync.mockImplementation(async (next) => {
      source = next;
    });
    player().replaceAsync.mockImplementationOnce(
      (next) =>
        new Promise<void>((resolve) => {
          finishReplace = () => {
            source = next;
            resolve();
          };
        }),
    );
    const { result } = open();
    act(() => result.current.shutdown());
    await waitFor(() => expect(player().replaceAsync).toHaveBeenCalledTimes(2));
    expect(source).toBeNull();
    await act(async () => finishReplace?.());
    expect(player().replaceAsync).toHaveBeenCalledTimes(3);
    expect(source).toBeNull();
    expect(player().muted).toBe(true);
    await reachReady();
    expect(player().play).not.toHaveBeenCalled();
  });

  it('does not attach a remux whose anchor resolves after the component unmounts', async () => {
    const { result, unmount } = open();
    await reachReady();
    let finishAnchor: ((value: unknown) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            finishAnchor = resolve;
          }),
      ),
    );
    act(() => result.current.setAudio(1));
    unmount();
    await act(async () => finishAnchor?.({ headers: { get: () => '40' } }));
    const sources = player().replaceAsync.mock.calls.filter(([source]) => source !== null);
    expect(sources).toHaveLength(1);
    expect(player().replaceAsync).toHaveBeenLastCalledWith(null);
    expect(player().muted).toBe(true);
  });

  it('keeps terminal local failures stopped when a stale ready event follows', async () => {
    const { result } = renderHook(() => useKromaEngine(CLIENT, ITEM, 0, 'file:///broken.mp4'));
    await reachReady();
    act(() =>
      player().emit('statusChange', { status: 'error', error: { message: 'Unsupported decoder' } }),
    );
    expect(result.current.failure?.kind).toBe('unsupported');
    await reachReady();
    act(() => result.current.togglePlay());
    expect(result.current.failed).toBe(true);
    expect(player().play).toHaveBeenCalledTimes(1);
    expect(player().muted).toBe(true);
  });

  it('reports the rejected native source error and stops its media session', async () => {
    player().replaceAsync.mockRejectedValueOnce(new Error('No such file'));
    const { result } = renderHook(() => useKromaEngine(CLIENT, ITEM, 0, 'file:///missing.mp4'));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.failure?.kind).toBe('missing');
    expect(player().showNowPlayingNotification).toBe(false);
    expect(player().replaceAsync).toHaveBeenLastCalledWith(null);
  });

  it('allows only the newest mounted engine to load and play', async () => {
    const first = player();
    const second = P.make();
    P.queue.push(first, second);
    const secondItem = { ...ITEM, id: 'itm_2' } as MediaItem;
    const { unmount } = renderHook(() => ({
      first: useKromaEngine(CLIENT, ITEM, 0),
      second: useKromaEngine(CLIENT, secondItem, 0),
    }));
    await waitFor(() => expect(second.replaceAsync).toHaveBeenCalledTimes(1));
    await act(async () => {
      first.emit('statusChange', { status: 'readyToPlay' });
      second.emit('statusChange', { status: 'readyToPlay' });
    });
    expect(first.play).not.toHaveBeenCalled();
    expect(first.muted).toBe(true);
    expect(first.replaceAsync.mock.calls.every(([source]) => source === null)).toBe(true);
    expect(second.play).toHaveBeenCalledOnce();
    unmount();
    expect(second.muted).toBe(true);
    expect(second.showNowPlayingNotification).toBe(false);
  });
});
