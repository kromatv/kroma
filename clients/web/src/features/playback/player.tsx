import {
  audioSupport,
  formatTimecode as fmtTime,
  type ItemId,
  type MediaItem,
  playerSubtitle,
} from '@kroma/core';
import {
  Player as UnifiedPlayer,
  useCast,
  useSubtitleAppearance,
  useT,
  WEB_FLAGS,
} from '@kroma/ui';
import { Box, Button, backdropBlur, Icon, Text } from '@kroma/ui/kit';
import type { Ref } from 'react';
import { useCallback, useMemo, useState } from 'react';
import type { View } from 'react-native';
import { Toast } from '#web/features/playback/player-toast';
import { usePlaybackSession } from '#web/features/playback/use-playback-session';
import { useResumeProgress } from '#web/features/playback/use-resume-progress';
import { useWebController } from '#web/features/playback/use-web-controller';
import { useWebUpNext } from '#web/features/playback/use-web-upnext';
import { kromaClient, type MovieView } from '#web/shared/lib/api';
import { useStoryboard } from '#web/shared/lib/use-storyboard';
import { castPicker } from '#web/shared/ui/cast-picker';

const PREVIEW_W = 176;

const FROST = backdropBlur(4);

/** Adapts the web engine to the shared unified `<Player>`; layers on web-only
 *  concerns (resume prompt, admin-stop overlay, session heartbeat). */
export function Player({
  item,
  next,
  following,
  onPlayNext,
  onPlayItem,
  onClose,
}: Readonly<{
  item: MovieView;
  next?: MediaItem | null;
  following?: MediaItem[];
  onPlayNext?: () => void;
  onPlayItem?: (id: string) => void;
  onClose: () => void;
}>) {
  const t = useT();
  const cast = useCast();
  const wc = useWebController(item);
  const { controller, videoRef, containerRef, pb, subtitleGen } = wc;
  const [appearance, setAppearance] = useSubtitleAppearance();
  const storyboard = useStoryboard(item.id);
  const tileAt = useCallback((sec: number) => storyboard.tile(sec, PREVIEW_W), [storyboard]);
  const upNext = useWebUpNext(item, following);
  const flags = useMemo(() => ({ ...WEB_FLAGS, cast: cast.available }), [cast.available]);

  // The engine already anchors at the saved position; this only shows the toast
  // and offers a restart.
  const position = useMemo(
    () => ({ seekTo: pb.seekTo, getPosition: pb.getPosition }),
    [pb.seekTo, pb.getPosition],
  );
  const { resumeAt, showResume, setShowResume } = useResumeProgress(videoRef, item, position);
  const [terminated, setTerminated] = useState<string | null>(null);

  usePlaybackSession({
    item,
    getPosition: pb.getPosition,
    playing: pb.playing,
    waiting: pb.waiting,
    mode: wc.playbackMode,
    audioLabel: wc.audioLabel,
    subtitleLabel: wc.subtitleLabel,
    onTerminated: (message) => {
      try {
        videoRef.current?.pause();
      } catch {
        /* ignore */
      }
      setTerminated(message?.trim() || t('player.stoppedDefault'));
    },
  });

  const audio = audioSupport(item);
  const warn =
    !audio.canPlay && !pb.useHls && audio.messageKey
      ? t(audio.messageKey, audio.messageVars)
      : null;

  const intro = useMemo(() => (item.markers ?? []).find((m) => m.kind === 'intro'), [item.markers]);
  const introActive =
    intro != null && pb.cur * 1000 >= intro.startMs && pb.cur * 1000 < intro.endMs;

  const nextTitle = next
    ? {
        title: next.episodeTitle ?? next.title,
        subtitle:
          next.season != null && next.episode != null
            ? `S${next.season} E${next.episode}`
            : undefined,
        posterUrl: kromaClient().backdropFor(next) ?? kromaClient().posterFor(next),
      }
    : null;

  const surface = (
    // borderRadius stays inline so the video clips itself to the shrink-card
    // radius even if the arbitrary-property class isn't generated.
    <video
      key={`${pb.anchor}:${pb.audioIndex}`}
      ref={videoRef}
      autoPlay
      playsInline
      crossOrigin="anonymous"
      style={{ borderRadius: 'inherit' }}
    >
      {/* Empty track satisfies the captions requirement; SubtitleRenderer renders cues out-of-band. */}
      <track kind="captions" />
    </video>
  );

  return (
    <UnifiedPlayer.Root
      controller={controller}
      flags={flags}
      title={item.title}
      subtitle={playerSubtitle(item)}
      warn={warn}
      onCast={async () => {
        const picked = await castPicker();
        if (!picked) return;
        const ok = await cast.playOn(
          picked,
          item.id as ItemId,
          Math.round(pb.getPosition() * 1000),
        );
        if (ok) onClose();
      }}
      markers={item.markers ?? undefined}
      tileAt={tileAt}
      appearance={appearance}
      onAppearanceChange={setAppearance}
      subtitleGen={subtitleGen}
      upNext={upNext}
      onPlayItem={(i) => onPlayItem?.(i.id)}
      onPlayNext={onPlayNext}
      nextTitle={nextTitle}
      introActive={introActive}
      onSkipIntro={intro ? () => pb.seekTo(intro.endMs / 1000) : undefined}
      // The shared chrome is typed against React Native, but under
      // react-native-web this ref receives the DOM node (requestFullscreen).
      ref={containerRef as unknown as Ref<View>}
      onClose={onClose}
    >
      <UnifiedPlayer.Media>{surface}</UnifiedPlayer.Media>
      {terminated ? (
        <UnifiedPlayer.Panel>
          <Box fill z={80} center gap={20} px={32} bg="black/85" style={FROST}>
            <Icon name="player-stop-filled" size={52} color="danger" />
            <Text variant="body" color="white/80" maxW={460} textAlign="center">
              {terminated}
            </Text>
            <Button
              variant="primary"
              size="sm"
              icon="chevron-left"
              label={t('player.back')}
              onPress={onClose}
            />
          </Box>
        </UnifiedPlayer.Panel>
      ) : null}
      {showResume && resumeAt != null ? (
        <Toast
          variant="info"
          onDismiss={() => setShowResume(false)}
          action={
            <Button
              variant="glass"
              size="sm"
              label={t('player.restart')}
              onPress={() => {
                pb.seekTo(0);
                setShowResume(false);
              }}
            />
          }
        >
          ⏵ {t('player.resumeAt', { time: fmtTime(resumeAt) })}
        </Toast>
      ) : null}
    </UnifiedPlayer.Root>
  );
}
