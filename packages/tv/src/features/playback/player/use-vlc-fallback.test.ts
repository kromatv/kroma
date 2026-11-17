// @vitest-environment jsdom

import type { MediaItem } from '@kromatv/client/media';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EnginePref } from '#tv/app/engine-pref';
import { movie } from './engine.fixture';

vi.mock('#tv/features/playback/player/vlc-plane', () => ({ vlcAvailable: () => true }));

const { useVlcFallback } = await import('#tv/features/playback/player/use-vlc-fallback.hook');

function fallback(item: MediaItem, pref: EnginePref = 'auto') {
  return renderHook((props) => useVlcFallback(props.item, props.pref), {
    initialProps: { item, pref },
  });
}

describe('useVlcFallback', () => {
  it('hands a title to VLC under the automatic engine', () => {
    const view = fallback(movie('a'));

    act(() => {
      view.result.current.take();
    });

    expect(view.result.current.active).toBe(true);
  });

  it('hands a title over only once', () => {
    const view = fallback(movie('a'));
    act(() => {
      view.result.current.take();
    });

    const again = view.result.current.take();

    expect(again).toBe(false);
  });

  it('leaves an engine the viewer named alone', () => {
    const view = fallback(movie('a'), 'remux');

    const taken = view.result.current.take();

    expect(taken).toBe(false);
  });

  it('lets go of the title once cleared', () => {
    const view = fallback(movie('a'));
    act(() => {
      view.result.current.take();
    });

    act(() => view.result.current.clear());

    expect(view.result.current.active).toBe(false);
  });

  it('does not carry over to the next title', () => {
    const view = fallback(movie('a'));
    act(() => {
      view.result.current.take();
    });

    view.rerender({ item: movie('b'), pref: 'auto' });

    expect(view.result.current.active).toBe(false);
  });
});
