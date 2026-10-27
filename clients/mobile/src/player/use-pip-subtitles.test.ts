// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { VideoPlayer } from 'expo-video';
import { describe, expect, it } from 'vitest';
import { usePipSubtitles } from './use-pip-subtitles';

function nativePlayer() {
  const listeners = new Map<string, () => void>();
  const player = {
    availableSubtitleTracks: [{ id: '0', language: 'fr', label: 'French' }],
    subtitleTrack: null as unknown,
    addListener(event: string, listener: () => void) {
      listeners.set(event, listener);
      return { remove: () => listeners.delete(event) };
    },
  };
  return { player, listeners, native: player as unknown as VideoPlayer };
}

describe('the subtitle renderer used by Picture in Picture', () => {
  it('hands the selected rendition to the system only while PiP is active', () => {
    const { player, native } = nativePlayer();
    const { rerender } = renderHook(({ inPip }) => usePipSubtitles(native, inPip, true), {
      initialProps: { inPip: false },
    });
    expect(player.subtitleTrack).toBeNull();
    rerender({ inPip: true });
    expect(player.subtitleTrack).toEqual(player.availableSubtitleTracks[0]);
    rerender({ inPip: false });
    expect(player.subtitleTrack).toBeNull();
  });

  it('reselects subtitles after a source replacement discovers new tracks', () => {
    const { player, native, listeners } = nativePlayer();
    player.availableSubtitleTracks = [];
    const { unmount } = renderHook(() => usePipSubtitles(native, true, true));
    expect(player.subtitleTrack).toBeNull();
    player.availableSubtitleTracks = [{ id: '0', language: 'en', label: 'English' }];
    act(() => listeners.get('availableSubtitleTracksChange')?.());
    expect(player.subtitleTrack).toEqual(player.availableSubtitleTracks[0]);
    unmount();
    expect(listeners.size).toBe(0);
  });

  it('keeps subtitles off in PiP when the viewer selected Off', () => {
    const { player, native } = nativePlayer();
    renderHook(() => usePipSubtitles(native, true, false));
    expect(player.subtitleTrack).toBeNull();
  });
});
