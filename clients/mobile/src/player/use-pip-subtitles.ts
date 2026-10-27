import type { VideoPlayer } from 'expo-video';
import { useEffect } from 'react';
import { patchPlayer } from './engine/types';

export function usePipSubtitles(player: VideoPlayer, inPip: boolean, selected: boolean): void {
  useEffect(() => {
    const apply = () => {
      patchPlayer(player, {
        subtitleTrack: inPip && selected ? (player.availableSubtitleTracks[0] ?? null) : null,
      });
    };
    apply();
    const tracks = player.addListener('availableSubtitleTracksChange', apply);
    const source = player.addListener('sourceLoad', apply);
    return () => {
      tracks.remove();
      source.remove();
    };
  }, [player, inPip, selected]);
}
