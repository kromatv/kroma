import type { MediaItem } from '@kromatv/client/media';
import { audioSupport, playerSubtitle } from '@kromatv/core';
import {
  Player as UnifiedPlayer,
  useCast,
  useSubtitleAppearance,
  useT,
  WEB_FLAGS,
} from '@kromatv/ui';
import { Box, Button, backdropBlur, classes, Icon, styles, Text, toast } from '@kromatv/ui/kit';
import { useCallback, useMemo, useState } from 'react';
import { usePlaybackSession } from '#web/features/playback/use-playback-session';
import { useResumeProgress } from '#web/features/playback/use-resume-progress';
import { useWebController } from '#web/features/playback/use-web-controller';
import { useWebUpNext } from '#web/features/playback/use-web-upnext';
import { kromaClient, type MovieView } from '#web/shared/lib/api';
import { useStoryboard } from '#web/shared/lib/use-storyboard';
import { castPicker } from '#web/shared/ui/cast-picker';

const PREVIEW_W = 176;

const s = styles({ frost: backdropBlur(4), inheritCorner: { borderRadius: 'inherit' } });

/** Adapts the web engine to the shared unified `<Player>`; layers on web-only
 *  concerns (admin-stop overlay, session heartbeat). */
export function Player({
  item,
  next,
  following,
  onPlayNext,
  onPlayItem,
  onGoHome,
  onClose,
}: Readonly<{
  item: MovieView;
  next?: MediaItem | null;
  following?: MediaItem[];
  onPlayNext?: () => void;
  onPlayItem?: (id: string) => void;
  onGoHome?: () => void;
  onClose: () => void;
}>) {
  const t = useT();
  const cast = useCast();
  const wc = useWebController(item);
  const { controller, videoRef, pb, subtitleGen } = wc;
  const [appearance, setAppearance] = useSubtitleAppearance();
  const storyboard = useStoryboard(item.id);
  const tileAt = useCallback((sec: number) => storyboard.tile(sec, PREVIEW_W), [storyboard]);
  const upNext = useWebUpNext(t, item, following);
  const flags = useMemo(() => ({ ...WEB_FLAGS, cast: cast.available }), [cast.available]);

  const position = useMemo(() => ({ getPosition: pb.getPosition }), [pb.getPosition]);
  const resumeAt = useResumeProgress(videoRef, item, position);
  const [terminated, setTerminated] = useState<string | null>(null);

  usePlaybackSession({
    item,
    getPosition: pb.getPosition,
    videoRef,
    baseSec: pb.baseSec,
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
    !audio.canPlay && wc.playbackMode === 'direct' && audio.messageKey
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
        posterUrl:
          kromaClient().media.artwork.backdropFor(next) ??
          kromaClient().media.artwork.posterFor(next),
      }
    : null;

  const surface = (
    <video
      key={`${pb.anchor}:${pb.audioIndex}`}
      ref={videoRef}
      playsInline
      crossOrigin="anonymous"
      className={classes(s.inheritCorner)}
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
      onCast={async () => {
        const picked = await castPicker();
        if (!picked) return;
        const failure = await cast.playOn(picked, item.id, Math.round(pb.getPosition() * 1000));
        if (failure) toast({ message: t(failure) });
        else onClose();
      }}
      onClose={onClose}
    >
      <UnifiedPlayer.Title>{item.title}</UnifiedPlayer.Title>
      <UnifiedPlayer.Subtitle>{playerSubtitle(item)}</UnifiedPlayer.Subtitle>
      {warn ? <UnifiedPlayer.Warning>{warn}</UnifiedPlayer.Warning> : null}
      <UnifiedPlayer.Transport tileAt={tileAt} />
      <UnifiedPlayer.Subtitles
        appearance={appearance}
        onAppearanceChange={setAppearance}
        gen={subtitleGen}
      />
      <UnifiedPlayer.UpNext data={upNext.data} onPlay={(i) => onPlayItem?.(i.id)} />
      <UnifiedPlayer.Credits
        markers={item.markers ?? undefined}
        next={nextTitle}
        onPlay={onPlayNext}
      />
      <UnifiedPlayer.PostPlay item={upNext.postPlay} onHome={onGoHome} />
      {intro ? (
        <UnifiedPlayer.SkipIntro
          active={introActive}
          onSkip={() => pb.seekTo(intro.endMs / 1000)}
        />
      ) : null}
      {resumeAt != null ? <UnifiedPlayer.Resume at={resumeAt} /> : null}
      <UnifiedPlayer.Media>{surface}</UnifiedPlayer.Media>
      {terminated ? (
        <UnifiedPlayer.Panel>
          <Box fill z={80} center gap={20} px={32} bg="black/85" style={s.frost}>
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
    </UnifiedPlayer.Root>
  );
}
