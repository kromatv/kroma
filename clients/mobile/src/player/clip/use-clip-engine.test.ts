// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanupEngineFixture,
  player,
  resetEngineFixture,
} from '#mobile/player/engine/engine.fixture';
import { PlaybackOwnerProvider } from '#mobile/player/playback-owner';

const { useClipEngine } = await import('./use-clip-engine');

const TRAILER = 'http://kroma.test/api/trailers/movie/1061474/Ox8ZLF6cGM0/stream?t=ticket';

function openClip(uri: string | null = TRAILER) {
  return renderHook(({ source }: { source: string | null }) => useClipEngine(source, 'Superman'), {
    initialProps: { source: uri },
    wrapper: PlaybackOwnerProvider,
  });
}

async function emit(type: string, payload: unknown = {}) {
  await act(() => Promise.resolve(player().emit(type, payload)));
}

beforeEach(resetEngineFixture);
afterEach(cleanupEngineFixture);

describe('a clip that is not ready yet', () => {
  it('waits without opening anything', () => {
    const { result } = openClip(null);

    expect(result.current.waiting).toBe(true);
    expect(player().replaceAsync).not.toHaveBeenCalled();
  });

  it('opens the file the moment it arrives, titled for the lock screen', async () => {
    const { rerender } = openClip(null);

    rerender({ source: TRAILER });

    await waitFor(() =>
      expect(player().replaceAsync).toHaveBeenCalledWith({
        uri: TRAILER,
        metadata: { title: 'Superman' },
      }),
    );
  });
});

describe('a clip that plays', () => {
  it('starts on its own once the file is ready', async () => {
    const { result } = openClip();

    await emit('statusChange', { status: 'readyToPlay' });

    expect(player().play).toHaveBeenCalledOnce();
    expect(result.current.waiting).toBe(false);
    expect(result.current.dur).toBe(7200);
  });

  it('does not restart a viewer’s pause when the file is ready again', async () => {
    openClip();
    await emit('statusChange', { status: 'readyToPlay' });

    await emit('statusChange', { status: 'readyToPlay' });

    expect(player().play).toHaveBeenCalledOnce();
  });

  it('seeks inside the file, never past its last second', async () => {
    const { result } = openClip();
    await emit('statusChange', { status: 'readyToPlay' });

    act(() => result.current.seekTo(9000));

    expect(player().currentTime).toBe(7199);
    expect(result.current.cur).toBe(7199);
  });

  it('skips from where the clock stands', async () => {
    const { result } = openClip();
    await emit('timeUpdate', { currentTime: 30, bufferedPosition: 60 });

    act(() => result.current.skip(-10));

    expect(player().currentTime).toBe(20);
  });
});

describe('the end of a clip', () => {
  it('ignores the end the native player reports before anything played', async () => {
    const { result } = openClip();

    await emit('playToEnd');

    expect(result.current.endedNonce).toBe(0);
  });

  it('counts the end once playback reached it', async () => {
    const { result } = openClip();
    await emit('timeUpdate', { currentTime: 7199, bufferedPosition: 7200 });
    player().currentTime = 7199;

    await emit('playToEnd');

    expect(result.current.endedNonce).toBe(1);
  });
});

describe('a clip that cannot play', () => {
  it('fails and silences the native player when the file errors', async () => {
    const { result } = openClip();

    await emit('statusChange', { status: 'error', error: { message: 'decode' } });

    expect(result.current.failed).toBe(true);
    expect(result.current.waiting).toBe(false);
    expect(player().muted).toBe(true);
  });

  it('fails when the native player refuses the file', async () => {
    player().replaceAsync.mockRejectedValueOnce(new Error('refused'));

    const { result } = openClip();

    await waitFor(() => expect(result.current.failed).toBe(true));
  });
});

describe('leaving a clip', () => {
  it('stops the native player and ignores what it reports afterwards', async () => {
    const { result } = openClip();

    act(() => result.current.shutdown());
    await emit('statusChange', { status: 'readyToPlay' });

    expect(player().play).not.toHaveBeenCalled();
    expect(player().muted).toBe(true);
    expect(player().showNowPlayingNotification).toBe(false);
  });

  it('stops when the screen unmounts', () => {
    const { unmount } = openClip();

    unmount();

    expect(player().pause).toHaveBeenCalled();
    expect(player().staysActiveInBackground).toBe(false);
  });
});
