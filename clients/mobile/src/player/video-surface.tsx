import { type VideoPlayer, VideoView } from 'expo-video';
import { type ReactNode, type Ref, useCallback, useImperativeHandle, useState } from 'react';
import { StyleSheet } from 'react-native';
import { usePipSubtitles } from './use-pip-subtitles';
import { useVisiblePlayback } from './use-visible-playback';

export interface PlayerVideoHandle {
  startPip(): void;
}

interface VideoPip {
  inPip: boolean;
  startPip(): void;
}

/** The picture under a phone player's chrome: one `VideoView` with picture in
 * picture, paused when the app leaves the screen without it. `children` draws
 * the chrome over it. */
export function VideoSurface({
  player,
  fill,
  nativeSubtitles = false,
  ref,
  children,
}: Readonly<{
  player: VideoPlayer;
  fill: boolean;
  nativeSubtitles?: boolean;
  ref?: Ref<PlayerVideoHandle>;
  children(pip: VideoPip): ReactNode;
}>) {
  const [view, setView] = useState<VideoView | null>(null);
  const [inPip, setInPip] = useState(false);
  useVisiblePlayback(player, inPip);
  usePipSubtitles(player, inPip, nativeSubtitles);
  const startPip = useCallback(() => {
    void view?.startPictureInPicture().catch(() => undefined);
  }, [view]);
  useImperativeHandle(ref, () => ({ startPip }), [startPip]);
  return (
    <>
      <VideoView
        ref={setView}
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit={fill ? 'cover' : 'contain'}
        nativeControls={false}
        allowsPictureInPicture
        startsPictureInPictureAutomatically
        onPictureInPictureStart={() => setInPip(true)}
        onPictureInPictureStop={() => setInPip(false)}
      />
      {children({ inPip, startPip })}
    </>
  );
}
