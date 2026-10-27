import { VideoView, type VideoView as VideoViewRef } from 'expo-video';
import { type ComponentProps, type Ref, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { PlayerChrome } from './PlayerChrome';
import { usePipSubtitles } from './use-pip-subtitles';
import { useVisiblePlayback } from './use-visible-playback';

export interface PlayerVideoHandle {
  startPip(): void;
}

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
  const view = useRef<VideoViewRef>(null);
  const [inPip, setInPip] = useState(false);
  useVisiblePlayback(chrome.engine.player, inPip);
  useImperativeHandle(
    ref,
    () => ({
      startPip: () => {
        void view.current?.startPictureInPicture().catch(() => undefined);
      },
    }),
    [],
  );
  usePipSubtitles(chrome.engine.player, inPip, nativeSubtitles);
  return (
    <>
      <VideoView
        ref={view}
        player={chrome.engine.player}
        style={StyleSheet.absoluteFill}
        contentFit={chrome.fill ? 'cover' : 'contain'}
        nativeControls={false}
        allowsPictureInPicture
        startsPictureInPictureAutomatically
        onPictureInPictureStart={() => setInPip(true)}
        onPictureInPictureStop={() => setInPip(false)}
      />
      <PlayerChrome
        {...chrome}
        compact={!fullscreen}
        cue={inPip ? '' : chrome.cue}
        onPip={() => {
          void view.current?.startPictureInPicture().catch(() => undefined);
        }}
      />
    </>
  );
}
