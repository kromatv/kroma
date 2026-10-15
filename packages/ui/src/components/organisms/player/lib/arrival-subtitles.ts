import type { Cue } from '@kromatv/core';
import type { WatchSubtitles } from '@kromatv/core/react';
import type { PlayerController, PlayerSub } from '#ui/components/organisms/player/types';

const NO_CUES: readonly Cue[] = [];

/** The controller's subtitles for a file still arriving: the file's text tracks,
 * each drawn from the cues its host holds rather than fetched by the renderer,
 * which is how a track still being extracted can grow while it plays. */
export function arrivalSubtitles(
  subs: Pick<WatchSubtitles, 'tracks' | 'active' | 'pick' | 'cues'>,
): Pick<PlayerController, 'subtitles' | 'subtitleIndex' | 'setSubtitle'> {
  return {
    subtitles: subs.tracks.map(
      (track): PlayerSub => ({
        index: track.index,
        language: track.language,
        codec: track.codec,
        selectable: true,
        cues: track.index === subs.active ? subs.cues : NO_CUES,
      }),
    ),
    subtitleIndex: subs.active,
    setSubtitle: subs.pick,
  };
}
