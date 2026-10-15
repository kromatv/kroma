// @vitest-environment jsdom
import type { WatchableProbe, WatchableTicket } from '@kromatv/client/watchable';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WatchableTarget } from '../watchable';
import type { WatchReady, WatchStage } from '../watchable-stage';
import { DOWNLOAD, FILE, PROBE, TARGET, TICKET, target } from './watch.fixture';
import { usePlayableStage, useWatchStage } from './watch-stage';

function stub() {
  const probe = vi.fn<() => Promise<WatchableProbe | 'pending'>>().mockResolvedValue(PROBE);
  const ticket = vi.fn<() => Promise<WatchableTicket>>().mockResolvedValue(TICKET);
  return { watchable: { probe, ticket }, probe, ticket };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('how far one file is from playing', () => {
  it('offers nothing where no module answers the capability', () => {
    const { probe } = stub();

    const { result } = renderHook(() => useWatchStage({ watchable: null, target: TARGET }));

    expect(result.current).toEqual({ stage: 'failed', failure: 'unsupported', message: null });
    expect(probe).not.toHaveBeenCalled();
  });

  it('is connecting, naming the release and the download, while no file is listed', () => {
    const { watchable, probe } = stub();

    const { result } = renderHook(() =>
      useWatchStage({
        watchable,
        target: null,
        release: 'Sintel.2010.1080p',
        downloadId: DOWNLOAD,
      }),
    );

    expect(result.current).toEqual({
      stage: 'connecting',
      release: 'Sintel.2010.1080p',
      downloadId: DOWNLOAD,
    });
    expect(probe).not.toHaveBeenCalled();
  });

  it('is buffering, on the file it was handed, until the container can be read', async () => {
    const { watchable, probe } = stub();
    probe.mockResolvedValue('pending');

    const { result } = renderHook(() => useWatchStage({ watchable, target: TARGET }));

    await waitFor(() => expect(probe).toHaveBeenCalledWith(DOWNLOAD, 5));
    expect(result.current).toMatchObject({ stage: 'buffering', release: null, target: TARGET });
  });

  it('is ready with the probe and the credential once both answer', async () => {
    const { watchable, probe, ticket } = stub();

    const { result } = renderHook(() => useWatchStage({ watchable, target: TARGET }));

    await waitFor(() => expect(result.current.stage).toBe('ready'));
    expect(result.current).toMatchObject({ target: TARGET, probe: PROBE, ticket: TICKET });
    expect(probe).toHaveBeenCalledWith(DOWNLOAD, 5);
    expect(ticket).toHaveBeenCalledWith(DOWNLOAD, 5);
  });

  it('asks the probe again while it says the bytes have not arrived', async () => {
    vi.useFakeTimers();
    const { watchable, probe, ticket } = stub();
    probe.mockResolvedValue('pending');

    renderHook(() => useWatchStage({ watchable, target: TARGET }));
    await vi.advanceTimersByTimeAsync(4_000);

    expect(probe.mock.calls.length).toBeGreaterThan(1);
    expect(ticket).toHaveBeenCalledTimes(1);
  });

  it('fails where the credential is refused rather than buffering forever', async () => {
    const { watchable, ticket } = stub();
    ticket.mockRejectedValue(new Error('gone'));

    const { result } = renderHook(() => useWatchStage({ watchable, target: TARGET }));

    await waitFor(() => expect(result.current.stage).toBe('failed'));
  });

  it('asks once for a target its caller rebuilds on every render', async () => {
    const { watchable, probe, ticket } = stub();

    const { result, rerender } = renderHook(() => useWatchStage({ watchable, target: target() }));
    await waitFor(() => expect(result.current.stage).toBe('ready'));
    rerender();
    rerender();

    expect(probe).toHaveBeenCalledTimes(1);
    expect(ticket).toHaveBeenCalledTimes(1);
  });

  it('reads the file the new target names when another one is followed', async () => {
    const { watchable, probe } = stub();
    const second: WatchableTarget = { ...TARGET, file: { ...FILE, index: 8 } };

    const { result, rerender } = renderHook(
      (followed: WatchableTarget) => useWatchStage({ watchable, target: followed }),
      { initialProps: TARGET },
    );
    await waitFor(() => expect(result.current.stage).toBe('ready'));
    rerender(second);

    expect(result.current.stage).toBe('buffering');
    await waitFor(() => expect(probe).toHaveBeenCalledWith(DOWNLOAD, 8));
  });
});

describe('the stage a picture is drawn from', () => {
  it('is nothing until one can be played', () => {
    const { result } = renderHook(() =>
      usePlayableStage({ stage: 'searching', release: null, downloadId: null }),
    );

    expect(result.current).toBeNull();
  });

  it('holds the first one that could, whatever the server says next', () => {
    const ready: WatchStage = {
      stage: 'ready',
      release: null,
      downloadId: DOWNLOAD,
      target: TARGET,
      probe: PROBE,
      ticket: TICKET,
    };

    const { result, rerender } = renderHook<WatchReady | null, WatchStage>(
      (stage) => usePlayableStage(stage),
      { initialProps: ready },
    );
    rerender({ stage: 'connecting', release: null, downloadId: null });

    expect(result.current).toBe(ready);
  });
});
