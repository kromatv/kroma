// @vitest-environment jsdom
import type {
  WatchableApi,
  WatchableSubtitle,
  WatchableSubtitleRef,
  WatchableVtt,
} from '@kromatv/client/watchable';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DOWNLOAD, PROBE, TARGET, TICKET } from './watch.fixture';
import { useWatchSubtitles, type WatchSubtitlesOptions } from './watch-subtitles';

const FRENCH: WatchableSubtitle = {
  index: 0,
  codec: 'subrip',
  language: 'fra',
  title: null,
  forced: false,
  text: true,
};
const ENGLISH: WatchableSubtitle = { ...FRENCH, index: 1, language: 'eng' };
const PICTURE: WatchableSubtitle = { ...FRENCH, index: 2, codec: 'hdmv_pgs_subtitle', text: false };

const READY = {
  target: TARGET,
  probe: { ...PROBE, subtitles: [FRENCH, ENGLISH, PICTURE] },
  ticket: TICKET,
};

const clock = (sec: number) =>
  `00:${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}.000`;

const vtt = (...cues: [number, string][]): string =>
  ['WEBVTT', ...cues.map(([at, text]) => `${clock(at)} --> ${clock(at + 2)}\n${text}`)].join(
    '\n\n',
  );

type Subtitles = Pick<WatchableApi, 'subtitles' | 'subtitleUrl'>;

function stub(...answers: (WatchableVtt | Error)[]) {
  let asked = 0;
  const subtitles = vi.fn(async (_: WatchableSubtitleRef): Promise<WatchableVtt> => {
    const answer = answers[Math.min(asked++, answers.length - 1)];
    if (answer instanceof Error) throw answer;
    return answer ?? { vtt: 'WEBVTT', partial: false };
  });
  const subtitleUrl = ({ index, token }: WatchableSubtitleRef) =>
    `http://kroma.test/subtitles/${index}.vtt?t=${token}`;
  const watchable: Subtitles = { subtitles, subtitleUrl };
  return { watchable, subtitles };
}

const options = (
  watchable: Subtitles,
  over: Partial<WatchSubtitlesOptions> = {},
): WatchSubtitlesOptions => ({
  watchable,
  ready: READY,
  positionSec: 0,
  waiting: false,
  ...over,
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the tracks a watch player offers', () => {
  it('lists the text tracks at the address each is fetched from, and no picture track', () => {
    const { watchable } = stub();

    const { result } = renderHook(() => useWatchSubtitles(options(watchable)));

    expect(result.current.tracks.map((track) => [track.index, track.url])).toEqual([
      [0, 'http://kroma.test/subtitles/0.vtt?t=tok_1'],
      [1, 'http://kroma.test/subtitles/1.vtt?t=tok_1'],
    ]);
  });

  it('plays the track in the preferred language until the viewer picks another', () => {
    const { watchable } = stub();
    const { result } = renderHook(() =>
      useWatchSubtitles(options(watchable, { preferredLanguage: 'eng' })),
    );
    const preferred = result.current.active;

    act(() => result.current.pick(0));

    expect([preferred, result.current.active]).toEqual([1, 0]);
  });

  it('keeps subtitles off once the viewer turns them off', () => {
    const { watchable } = stub();
    const { result } = renderHook(() =>
      useWatchSubtitles(options(watchable, { preferredLanguage: 'fra' })),
    );

    act(() => result.current.pick(null));

    expect(result.current.active).toBeNull();
  });
});

describe('the cues of the playing track', () => {
  it('asks nothing while subtitles are off', () => {
    const { watchable, subtitles } = stub();

    renderHook(() => useWatchSubtitles(options(watchable)));

    expect(subtitles).not.toHaveBeenCalled();
  });

  it('draws the picked track, fetched with the ticket minted for its file', async () => {
    const { watchable, subtitles } = stub({ vtt: vtt([10, 'Bonjour']), partial: false });
    const { result } = renderHook(() => useWatchSubtitles(options(watchable)));

    act(() => result.current.pick(0));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.cues).toEqual([{ start: 10, end: 12, text: 'Bonjour' }]);
    expect(subtitles).toHaveBeenCalledWith({ id: DOWNLOAD, file: 5, index: 0, token: 'tok_1' });
  });

  it('is loading from a pick until the track first answers', () => {
    const { watchable } = stub({ vtt: vtt([10, 'Bonjour']), partial: false });
    const { result } = renderHook(() => useWatchSubtitles(options(watchable)));

    act(() => result.current.pick(0));

    expect(result.current).toMatchObject({ loading: true, cues: [] });
  });

  it('draws nothing of a track the viewer turned away from', async () => {
    const { watchable } = stub({ vtt: vtt([10, 'Bonjour']), partial: false });
    const { result } = renderHook(() =>
      useWatchSubtitles(options(watchable, { preferredLanguage: 'fra' })),
    );
    await waitFor(() => expect(result.current.cues).toHaveLength(1));

    act(() => result.current.pick(null));

    expect(result.current.cues).toEqual([]);
  });
});

describe('a track still arriving', () => {
  it('is asked for again every twenty seconds, keeping the cues already drawn', async () => {
    vi.useFakeTimers();
    const { watchable, subtitles } = stub(
      { vtt: vtt([10, 'Bonjour']), partial: true },
      { vtt: vtt([600, 'Plus loin']), partial: true },
    );
    const { result } = renderHook(() =>
      useWatchSubtitles(options(watchable, { preferredLanguage: 'fra' })),
    );

    await act(() => vi.advanceTimersByTimeAsync(20_100));

    expect(subtitles).toHaveBeenCalledTimes(2);
    expect(result.current.cues.map((cue) => cue.text)).toEqual(['Bonjour', 'Plus loin']);
  });

  it('is not asked for again once it answers complete', async () => {
    vi.useFakeTimers();
    const { watchable, subtitles } = stub(
      { vtt: vtt([10, 'Bonjour']), partial: true },
      { vtt: vtt([10, 'Bonjour'], [600, 'Plus loin']), partial: false },
    );
    renderHook(() => useWatchSubtitles(options(watchable, { preferredLanguage: 'fra' })));

    await vi.advanceTimersByTimeAsync(90_000);

    expect(subtitles).toHaveBeenCalledTimes(2);
  });

  it('is asked for again right after a seek lands', async () => {
    vi.useFakeTimers();
    const { watchable, subtitles } = stub({ vtt: vtt([10, 'Bonjour']), partial: true });
    const { rerender } = renderHook(
      (at: { positionSec: number; waiting: boolean }) =>
        useWatchSubtitles(options(watchable, { preferredLanguage: 'fra', ...at })),
      { initialProps: { positionSec: 10, waiting: false } },
    );
    await vi.advanceTimersByTimeAsync(50);

    rerender({ positionSec: 600, waiting: true });
    rerender({ positionSec: 600.3, waiting: false });
    await vi.advanceTimersByTimeAsync(50);

    expect(subtitles).toHaveBeenCalledTimes(2);
  });

  it('is not asked for again after a seek once it is complete', async () => {
    vi.useFakeTimers();
    const { watchable, subtitles } = stub({ vtt: vtt([10, 'Bonjour']), partial: false });
    const { rerender } = renderHook(
      (positionSec: number) =>
        useWatchSubtitles(options(watchable, { preferredLanguage: 'fra', positionSec })),
      { initialProps: 10 },
    );
    await vi.advanceTimersByTimeAsync(50);

    rerender(600);
    await vi.advanceTimersByTimeAsync(50);

    expect(subtitles).toHaveBeenCalledTimes(1);
  });

  it('is asked for again at the same pace after an answer is refused', async () => {
    vi.useFakeTimers();
    const { watchable, subtitles } = stub(new Error('503'), {
      vtt: vtt([10, 'Bonjour']),
      partial: true,
    });
    const { result } = renderHook(() =>
      useWatchSubtitles(options(watchable, { preferredLanguage: 'fra' })),
    );

    await act(() => vi.advanceTimersByTimeAsync(20_100));

    expect(subtitles).toHaveBeenCalledTimes(2);
    expect(result.current.cues).toHaveLength(1);
  });

  it('stops asking once the screen is gone', async () => {
    vi.useFakeTimers();
    const { watchable, subtitles } = stub({ vtt: vtt([10, 'Bonjour']), partial: true });
    const { unmount } = renderHook(() =>
      useWatchSubtitles(options(watchable, { preferredLanguage: 'fra' })),
    );
    await vi.advanceTimersByTimeAsync(50);

    unmount();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(subtitles).toHaveBeenCalledTimes(1);
  });
});
