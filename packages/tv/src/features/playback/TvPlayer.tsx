import type { MediaItem } from '@kromatv/client/media';
import type { ReportCategory } from '@kromatv/client/reports';
import { playerSubtitle } from '@kromatv/core';
import {
  Player,
  TV_FLAGS,
  UP_NEXT_ART_W,
  type UpNextItem,
  useSubtitleAppearance,
  useT,
} from '@kromatv/ui';
import { Box, Button, radius as cornerRadius, Icon, style, Text } from '@kromatv/ui/kit';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEnv } from '#tv/app/providers/env';
import { usePlayerSlot } from '#tv/app/playerDock';
import { useClient } from '#tv/app/router';
import { useCastTarget } from '#tv/features/cast/castBridge';
import { revealNativeSurface } from '#tv/features/playback/player/nativeSurface';
import { usePlaybackBackend } from '#tv/features/playback/player/playbackBackend';
import { useNowPlaying } from '#tv/features/playback/player/useNowPlaying';
import { useStoryboard } from '#tv/features/playback/player/useStoryboard';
import { useTvController } from '#tv/features/playback/use-tv-controller';
import { useDockedPlayer } from '#tv/features/playback/use-docked-player';
import { useTvPip } from '#tv/features/playback/use-tv-pip';
import { useTvUpNext } from '#tv/features/playback/use-tv-upnext';

const PREVIEW_W = 256;

const BACK = style({ radius: cornerRadius.pill, mt: 8 });

/**
 * The TV player: a thin wrapper adapting the native-plane engine to the
 * shared unified `<Player>`, with TV feature flags (no volume / fullscreen, and
 * picture-in-picture where the surface has it). This handles the surface plane,
 * "up next" autoplay, the dock behind a picture-in-picture window, and the OS
 * now-playing widget; chrome + D-pad interaction live in the shared component.
 */
export function TvPlayer() {
  const { item, docked } = usePlayerSlot();
  const moves = useDockedPlayer(item, docked);
  const pip = useTvPip(moves.onPipStart, moves.onPipStop);
  const client = useClient();
  const t = useT();
  const { Surface, pictureInPicture } = usePlaybackBackend();
  const { controller, pb, subtitleGen } = useTvController(client, item, pip);
  // Reveal-on-pointer only with a real desktop mouse: a TV remote emits
  // phantom pointermove that would pin the chrome open, so there the D-pad
  // drives reveal instead (see env.mousePointer).
  const { mousePointer } = useEnv();
  const canPip = pictureInPicture(pb.surface);
  const playerFlags = useMemo(
    () => ({ ...TV_FLAGS, pointer: mousePointer, pip: canPip }),
    [mousePointer, canPip],
  );

  // Publish this player to the cast receiver, so a phone can drive it (and pick
  // up the position a cast "play" asked to start from).
  useCastTarget(item, controller);
  const [appearance, setAppearance] = useSubtitleAppearance();
  const storyboard = useStoryboard(client, item.id);
  const tileAt = useCallback((sec: number) => storyboard.tile(sec, PREVIEW_W), [storyboard]);

  // Upcoming episodes (series autoplay uses [0]) + the up-next sheet data.
  const [following, setFollowing] = useState<MediaItem[]>([]);
  const advancedRef = useRef(false);
  const [followingFor, setFollowingFor] = useState({ client, id: item.id });
  if (followingFor.client !== client || followingFor.id !== item.id) {
    setFollowingFor({ client, id: item.id });
    setFollowing([]);
  }
  useEffect(() => {
    advancedRef.current = false;
    let cancelled = false;
    client.playback
      .following(item.id)
      .then((list) => !cancelled && setFollowing(list))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, item.id]);
  const next = following[0] ?? null;
  const up = useTvUpNext(client, t, item, following);

  const goNext = useCallback(() => {
    if (advancedRef.current || !next) return;
    advancedRef.current = true;
    // swap, not push: Back returns to the show/detail you launched from.
    moves.swap(next);
  }, [next, moves]);
  const onPlayItem = useCallback(
    (i: UpNextItem) => {
      const full = up.byId.get(i.id);
      if (full) moves.swap(full);
    },
    [up.byId, moves],
  );

  const subtitle = playerSubtitle(item);
  useNowPlaying({
    client,
    item,
    title: item.title,
    subtitle,
    durationSec: pb.dur,
    positionSec: pb.cur,
    playing: pb.playing,
    seekTo: pb.seekTo,
    seek: pb.seek,
    seekNonce: pb.seekNonce,
  });

  // Intro window (episodes only).
  const intro = useMemo(() => (item.markers ?? []).find((m) => m.kind === 'intro'), [item.markers]);
  const introActive =
    intro != null && pb.cur * 1000 >= intro.startMs && pb.cur * 1000 < intro.endMs;

  useEffect(() => {
    if (pb.surface === 'video' || !pb.ready) return;
    return revealNativeSurface();
  }, [pb.surface, pb.ready]);

  const nextTitle = next
    ? {
        title: next.episodeTitle ?? next.title,
        subtitle:
          next.season != null && next.episode != null
            ? `S${next.season} E${next.episode}`
            : undefined,
        posterUrl:
          client.media.artwork.backdropFor(next, UP_NEXT_ART_W) ??
          client.media.artwork.posterFor(next, UP_NEXT_ART_W),
      }
    : null;

  // Targets exactly what is playing: for a series, the episode, not the show.
  const onReport = useCallback(
    async (category: ReportCategory) => {
      await client.reports.create({
        subjectKind: item.kind === 'episode' ? 'episode' : 'movie',
        subjectId: item.id,
        category,
        message: null,
      });
    },
    [client, item.id, item.kind],
  );

  return (
    <Player.Root
      controller={controller}
      flags={playerFlags}
      title={item.title}
      active={!docked}
      onClose={moves.leave}
    >
      <Player.Title>{item.title}</Player.Title>
      {subtitle ? <Player.Subtitle>{subtitle}</Player.Subtitle> : null}
      <Player.Transport tileAt={tileAt} />
      <Player.Subtitles
        appearance={appearance}
        onAppearanceChange={setAppearance}
        gen={subtitleGen}
      />
      <Player.Report onReport={onReport} />
      <Player.UpNext data={up.data} onPlay={onPlayItem} />
      <Player.Credits
        markers={item.markers ?? undefined}
        next={nextTitle}
        onPlay={next ? goNext : undefined}
      />
      <Player.PostPlay item={up.postPlay} onHome={moves.home} />
      {intro ? (
        <Player.SkipIntro active={introActive} onSkip={() => pb.seekTo(intro.endMs / 1000)} />
      ) : null}
      {pb.resumedAt ? (
        <Player.Resume
          at={pb.resumedAt}
          art={
            client.media.artwork.backdropFor(item, UP_NEXT_ART_W) ??
            client.media.artwork.posterFor(item, UP_NEXT_ART_W)
          }
        />
      ) : null}
      <Player.Media>
        <Surface pb={pb} title={item.title} pip={pip.binding} />
      </Player.Media>
      {pb.terminated != null ? (
        <Player.Panel>
          <Box fill z={80} center gap={24} px={64} bg="black/92">
            <Icon name="player-stop-filled" size={64} color="danger" />
            <Text variant="headingTv" textAlign="center" color="white">
              {t('player.stoppedTitle')}
            </Text>
            <Text variant="bodyTv" textAlign="center" maxW={672} color="text/72">
              {pb.terminated || t('player.stoppedDefault')}
            </Text>
            <Button
              icon="chevron-left"
              label={t('player.back')}
              onPress={moves.leave}
              style={BACK}
              autoFocus
            />
          </Box>
        </Player.Panel>
      ) : null}
    </Player.Root>
  );
}
