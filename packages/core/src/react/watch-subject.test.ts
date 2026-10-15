// @vitest-environment jsdom
import type { WatchableApi, WatchableStartBody } from '@kromatv/client/watchable';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WatchSubject } from '../watchable-stage';
import { DOWNLOAD, FILE, PROBE, TARGET, TICKET } from './watch.fixture';
import { useWatchSubject } from './watch-subject';

const SINTEL: WatchableStartBody = {
  tmdbId: 45_745,
  kind: 'movie',
  title: 'Sintel',
  year: 2010,
  season: null,
  episode: null,
};

const ASKED: WatchSubject = { kind: 'title', title: SINTEL };

const EPISODE: WatchableStartBody = {
  tmdbId: 1399,
  kind: 'show',
  title: 'Charge',
  year: 2022,
  season: 1,
  episode: 1,
};

const PACK_S01 = {
  ...TARGET.entry,
  tmdbId: 1399,
  kind: 'show' as const,
  files: [
    { ...FILE, index: 1, name: 'S01E01.mkv', sizeBytes: 900_000_000, season: 1, episode: 1 },
    { ...FILE, index: 2, name: 'S01E02.mkv', sizeBytes: 400_000_000, season: 1, episode: 2 },
  ],
};

function stub(start: WatchableApi['start']) {
  const list = vi.fn().mockResolvedValue({ entries: [TARGET.entry] });
  const probe = vi.fn().mockResolvedValue(PROBE);
  const ticket = vi.fn().mockResolvedValue(TICKET);
  const progress = vi.fn().mockResolvedValue(null);
  return { start, list, probe, ticket, progress } as unknown as WatchableApi;
}

const started = () =>
  stub(
    vi.fn().mockResolvedValue({ kind: 'started', downloadId: DOWNLOAD, release: 'Sintel.2010' }),
  );

describe('the road from what a viewer pressed to a picture', () => {
  it('starts the title it was handed and plays the download that answers', async () => {
    const watchable = started();

    const { result } = renderHook(() => useWatchSubject(ASKED, watchable));

    await waitFor(() => expect(result.current.playable).not.toBeNull());
    expect(watchable.start).toHaveBeenCalledWith(SINTEL);
    expect(result.current.target?.file.index).toBe(FILE.index);
  });

  it('names the release it found while the picture is still coming', async () => {
    const watchable = started();

    const { result } = renderHook(() => useWatchSubject(ASKED, watchable));

    await waitFor(() => expect(result.current.playable).not.toBeNull());
    expect(result.current.playable?.release).toBe('Sintel.2010');
  });

  it('finds the download in the listing when the module stopped waiting for it', async () => {
    const watchable = stub(vi.fn().mockResolvedValue({ kind: 'timedOut' }));

    const { result } = renderHook(() => useWatchSubject(ASKED, watchable));

    await waitFor(() => expect(result.current.target).not.toBeNull());
    expect(result.current.target?.entry.id).toBe(DOWNLOAD);
  });

  it('never plays another episode of the same show after the module stopped waiting', async () => {
    const watchable = stub(vi.fn().mockResolvedValue({ kind: 'timedOut' }));
    const asked: WatchSubject = { kind: 'title', title: { ...EPISODE, season: 2, episode: 5 } };
    vi.mocked(watchable.list).mockResolvedValue({ entries: [PACK_S01] });

    const { result } = renderHook(() => useWatchSubject(asked, watchable));

    await waitFor(() => expect(watchable.list).toHaveBeenCalled());
    expect(result.current.target).toBeNull();
  });

  it('plays the episode asked for out of a pack the listing holds after the module stopped waiting', async () => {
    const watchable = stub(vi.fn().mockResolvedValue({ kind: 'timedOut' }));
    const asked: WatchSubject = { kind: 'title', title: { ...EPISODE, season: 1, episode: 2 } };
    vi.mocked(watchable.list).mockResolvedValue({ entries: [PACK_S01] });

    const { result } = renderHook(() => useWatchSubject(asked, watchable));

    await waitFor(() => expect(result.current.target).not.toBeNull());
    expect(result.current.target?.file).toMatchObject({ season: 1, episode: 2 });
  });

  it('refuses a title the indexers answered nothing for, quoting the module', async () => {
    const watchable = stub(vi.fn().mockResolvedValue({ kind: 'noRelease', message: 'no seeders' }));

    const { result } = renderHook(() => useWatchSubject(ASKED, watchable));

    await waitFor(() => expect(result.current.stage.stage).toBe('failed'));
    expect(result.current.stage).toMatchObject({ failure: 'noSource', message: 'no seeders' });
  });

  it('plays a download it was handed without starting a second one', async () => {
    const watchable = started();

    const { result } = renderHook(() =>
      useWatchSubject({ kind: 'download', downloadId: DOWNLOAD, file: FILE.index }, watchable),
    );

    await waitFor(() => expect(result.current.playable).not.toBeNull());
    expect(watchable.start).not.toHaveBeenCalled();
  });

  it('is still buffering while the module cannot read the file yet', async () => {
    const watchable = started();
    vi.mocked(watchable.probe).mockResolvedValue('pending');

    const { result } = renderHook(() => useWatchSubject(ASKED, watchable));

    await waitFor(() => expect(result.current.stage.stage).toBe('buffering'));
    expect(result.current.playable).toBeNull();
  });

  it('is connecting for a download the module does not list', async () => {
    const watchable = started();
    vi.mocked(watchable.list).mockResolvedValue({ entries: [] });

    const { result } = renderHook(() =>
      useWatchSubject({ kind: 'download', downloadId: DOWNLOAD, file: FILE.index }, watchable),
    );

    await waitFor(() => expect(watchable.list).toHaveBeenCalled());
    expect(result.current.stage).toEqual({
      stage: 'connecting',
      release: null,
      downloadId: DOWNLOAD,
    });
  });

  it('fails plainly where the start request throws', async () => {
    const watchable = stub(vi.fn().mockRejectedValue(new Error('500')));

    const { result } = renderHook(() => useWatchSubject(ASKED, watchable));

    await waitFor(() => expect(result.current.stage).toMatchObject({ failure: 'failed' }));
  });

  it('offers nothing where no module answers the capability', () => {
    const { result } = renderHook(() => useWatchSubject(ASKED, null));

    expect(result.current.stage).toEqual({
      stage: 'failed',
      failure: 'unsupported',
      message: null,
    });
  });

  it('follows the same title across a rebuilt subject rather than starting it twice', async () => {
    const watchable = started();

    const { result, rerender } = renderHook(() =>
      useWatchSubject({ kind: 'title', title: { ...SINTEL } }, watchable),
    );
    await waitFor(() => expect(result.current.playable).not.toBeNull());
    rerender();

    expect(watchable.start).toHaveBeenCalledTimes(1);
  });
});
