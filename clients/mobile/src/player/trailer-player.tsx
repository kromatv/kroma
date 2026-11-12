import type { TmdbKind } from '@kromatv/client/discovery';
import type { Trailer } from '@kromatv/client/trailers';
import { TRAILER_LABEL, youtubeWatchUrl } from '@kromatv/core';
import { useTrailerPreparation } from '@kromatv/core/react';
import { usePreventRemove } from 'expo-router';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { Linking } from 'react-native';
import { useT } from '#mobile/lib/i18n';
import { useClient } from '#mobile/lib/session';
import { ClipChrome } from '#mobile/player/clip/clip-chrome';
import { ClipDetails } from '#mobile/player/clip/clip-details';
import { useClipEngine } from '#mobile/player/clip/use-clip-engine';
import { PlayerLayout } from '#mobile/player/player-layout';
import { PlayerStatusScreen } from '#mobile/player/player-status-screen';
import { PortraitHeader } from '#mobile/player/portrait-header';
import { PortraitPlaybackStrip } from '#mobile/player/portrait-playback-strip';
import { usePlayerPresentation } from '#mobile/player/use-player-presentation';
import { VideoSurface } from '#mobile/player/video-surface';

/** A title's trailer in the phone player's chrome. The server fetches it on the
 * first press, so the chrome holds its loading state until the file plays, and
 * a trailer it could not fetch offers YouTube instead. Nothing is saved, and the
 * end of the trailer closes the player. */
export function TrailerPlayer({
  kind,
  tmdbId,
  trailer,
  title,
  onClose,
}: Readonly<{
  kind: TmdbKind;
  tmdbId: number;
  trailer: Trailer;
  title: string;
  onClose(): void;
}>) {
  const t = useT();
  const client = useClient();
  const { video } = trailer;
  const state = useTrailerPreparation(() => client.trailers.prepare(kind, tmdbId, video), video);
  const uri = useMemo(
    () => (state === 'ready' ? client.trailers.streamUrl(kind, tmdbId, video) : null),
    [state, client, kind, tmdbId, video],
  );
  const clip = useClipEngine(uri, title);
  const presentation = usePlayerPresentation();
  const [fill, setFill] = useState(false);
  const label = t(TRAILER_LABEL[trailer.version]);

  const [guarded, setGuarded] = useState(true);
  usePreventRemove(guarded, ({ repeat }) => {
    clip.shutdown();
    setGuarded(false);
    repeat();
  });

  const exit = () => {
    clip.shutdown();
    onClose();
  };
  const leaveAtEnd = useEffectEvent(exit);
  const ended = clip.endedNonce > 0;
  useEffect(() => {
    if (ended) leaveAtEnd();
  }, [ended]);

  if (state === 'failed' || clip.failed) {
    return (
      <PlayerStatusScreen
        title={t('trailer.failed')}
        message={t('trailer.failedHint')}
        action={{
          icon: 'brand-youtube',
          label: t('trailer.openOnYoutube'),
          onPress: () => void Linking.openURL(youtubeWatchUrl(video)).catch(() => undefined),
        }}
        onBack={exit}
      />
    );
  }

  return (
    <PlayerLayout
      fullscreen={presentation.fullscreen}
      header={<PortraitHeader onBack={exit} />}
      transport={<PortraitPlaybackStrip engine={clip} onFullscreen={presentation.toggle} />}
      details={<ClipDetails title={title} label={label} />}
      video={
        <VideoSurface player={clip.player} fill={fill}>
          {({ startPip }) => (
            <ClipChrome
              clip={clip}
              title={title}
              subtitle={label}
              fill={fill}
              onZoom={setFill}
              notice={state === 'preparing' ? t('trailer.preparing') : null}
              compact={!presentation.fullscreen}
              onBack={presentation.fullscreen ? presentation.collapse : exit}
              onPip={startPip}
              onFullscreen={presentation.toggle}
            />
          )}
        </VideoSurface>
      }
    />
  );
}
