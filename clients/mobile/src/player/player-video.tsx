import type { ComponentProps, Ref } from 'react';
import { PlayerChrome } from './PlayerChrome';
import { type PlayerVideoHandle, VideoSurface } from './video-surface';

export function PlayerVideo({
  nativeSubtitles,
  fullscreen,
  ref,
  ...chrome
}: Readonly<
  Omit<ComponentProps<typeof PlayerChrome>, 'onPip' | 'compact'> & {
    nativeSubtitles: boolean;
    fullscreen: boolean;
    ref?: Ref<PlayerVideoHandle>;
  }
>) {
  return (
    <VideoSurface
      ref={ref}
      player={chrome.engine.player}
      fill={chrome.fill}
      nativeSubtitles={nativeSubtitles}
    >
      {({ inPip, startPip }) => (
        <PlayerChrome
          {...chrome}
          compact={!fullscreen}
          cue={inPip ? '' : chrome.cue}
          onPip={startPip}
        />
      )}
    </VideoSurface>
  );
}
