// @vitest-environment jsdom

import { I18nProvider } from '@kromatv/ui';
import { act, cleanup, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CLIP_LENGTH_SEC,
  type FakeClip,
  fakeClipBackend,
} from '#tv/features/playback/player/clipBackend.fixture';
import { useClipPlayback } from '#tv/features/playback/player/useClipPlayback';
import { useTvClipController } from '#tv/features/playback/use-tv-clip-controller';

const TRAILER = 'http://kroma.test/api/trailers/movie/1061474/qu5n7RALVpE/stream?t=tk';

function english({ children }: Readonly<{ children: ReactNode }>) {
  return createElement(I18nProvider, { locale: 'en', children });
}

function mount(url: string | null = TRAILER) {
  const { backend, built } = fakeClipBackend();
  const hook = renderHook(
    ({ src }) => {
      const clip = useClipPlayback(backend, src);
      return useTvClipController(clip);
    },
    { initialProps: { src: url }, wrapper: english },
  );
  const engine = () => built.at(-1) as FakeClip;
  return { ...hook, built, engine };
}

afterEach(cleanup);

describe('the clip controller', () => {
  it('opens nothing while the trailer is still being fetched', () => {
    const { built, result } = mount(null);

    expect(built).toEqual([]);
    expect(result.current.waiting).toBe(true);
  });

  it('opens the trailer once the server has it', () => {
    const { built, rerender } = mount(null);

    rerender({ src: TRAILER });

    expect(built.map((engine) => engine.url)).toEqual([TRAILER]);
  });

  it('starts the clip the first time it is ready', () => {
    const { engine, result } = mount();

    act(() => engine().listeners.onReady());

    expect(engine().playing).toBe(true);
    expect(result.current.ready).toBe(true);
  });

  it('leaves a clip the viewer paused alone when it is ready again', () => {
    const { engine, result } = mount();
    act(() => engine().listeners.onReady());
    act(() => result.current.togglePlay());

    act(() => engine().listeners.onReady());

    expect(engine().playing).toBe(false);
  });

  it('lands a seek past the end just short of it', () => {
    const { engine, result } = mount();

    act(() => result.current.seekTo(500));

    expect(engine().at).toBe(CLIP_LENGTH_SEC - 0.5);
    expect(result.current.cur).toBe(CLIP_LENGTH_SEC - 0.5);
  });

  it('skips from where the clip is', () => {
    const { engine, result } = mount();
    engine().at = 10;

    act(() => result.current.skip(10));

    expect(engine().at).toBe(20);
  });

  it('seeks once, where a scrub was let go', () => {
    const { engine, result } = mount();
    act(() => result.current.scrubPreview(30));

    act(() => result.current.scrubCommit());

    expect(engine().at).toBe(30);
    expect(result.current.seekPreview).toBeNull();
  });

  it('plays the clip at the speed the viewer picks', () => {
    const { engine, result } = mount();

    act(() => result.current.setRate(1.5));

    expect(engine().rate).toBe(1.5);
    expect(result.current.rate).toBe(1.5);
  });

  it('says the clip will not play when the engine gives up on it', () => {
    const { engine, result } = mount();

    act(() => engine().listeners.onError());

    expect(result.current.error).toBe('This video will not play');
    expect(result.current.waiting).toBe(false);
  });

  it('counts each time the clip runs out', () => {
    const { engine, result } = mount();

    act(() => engine().listeners.onEnded());

    expect(result.current.endedNonce).toBe(1);
  });

  it('offers no audio or subtitle track to pick', () => {
    const { result } = mount();

    expect(result.current.audioTracks).toEqual([]);
    expect(result.current.subtitles).toEqual([]);
  });

  it('lets go of the clip when the screen leaves', () => {
    const { engine, unmount } = mount();

    unmount();

    expect(engine().destroyed).toBe(true);
  });
});
