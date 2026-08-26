import {
  audioSupport,
  type MediaItem,
  playerSubtitle,
  type ReportCategory,
  type Translate,
} from '@kroma/core';
import {
  Player,
  TV_FLAGS,
  UP_NEXT_ART_W,
  type UpNextItem,
  useSubtitleAppearance,
  useT,
} from '@kroma/ui';
import { Box, Button, Icon, Text } from '@kroma/ui/kit';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEnv } from '#tv/app/providers/env';
import { useClient, useNav, useParams } from '#tv/app/router';
import { useCastTarget } from '#tv/features/cast/castBridge';
import { revealNativeSurface } from '#tv/features/playback/player/nativeSurface';
import { PlayerSurface } from '#tv/features/playback/player/PlayerSurface';
import type { Playback } from '#tv/features/playback/player/useDirectPlayback';
import { useNowPlaying } from '#tv/features/playback/player/useNowPlaying';
import { useStoryboard } from '#tv/features/playback/player/useStoryboard';
import { useTvController } from '#tv/features/playback/use-tv-controller';
import { useTvUpNext } from '#tv/features/playback/use-tv-upnext';

const PREVIEW_W = 256;

// Priority order: stream/codec error -> direct-play verdict (in-page surface
// only) -> audio support. Null when nothing to warn about.
function playerWarn(pb: Playback, item: MediaItem, t: Translate): string | null {
  if (pb.error) return t(pb.error);
  if (pb.surface === 'video' && pb.verdict && !pb.verdict.canDirectPlay)
    return t(pb.verdict.messageKey, pb.verdict.messageVars);
  const audio = audioSupport(item);
  if (!audio.canPlay && audio.messageKey) return t(audio.messageKey, audio.messageVars);
  return null;
}

/**
 * The TV player: a thin wrapper adapting the native-plane engine to the
 * shared unified `<Player>`, with TV feature flags (no volume / PiP /
 * fullscreen). This handles the surface plane, "up next" autoplay, and the
 * OS now-playing widget; chrome + D-pad interaction live in the shared component.
 */
export function TvPlayer() {
  const nav = useNav();
  const { item } = useParams('player');
  const client = useClient();
  const t = useT();
  // Reveal-on-pointer only with a real desktop mouse: a TV remote emits
  // phantom pointermove that would pin the chrome open, so there the D-pad
  // drives reveal instead (see env.mousePointer).
  const { mousePointer } = useEnv();
  const playerFlags = useMemo(() => ({ ...TV_FLAGS, pointer: mousePointer }), [mousePointer]);

  const { controller, pb, subtitleGen } = useTvController(client, item);
  // Publish this player to the cast receiver, so a phone can drive it (and pick
  // up the position a cast "play" asked to start from).
  useCastTarget(item, controller);
  const [appearance, setAppearance] = useSubtitleAppearance();
  const storyboard = useStoryboard(client, item.id);
  const tileAt = useCallback((sec: number) => storyboard.tile(sec, PREVIEW_W), [storyboard]);

  // Upcoming episodes (series autoplay uses [0]) + the up-next sheet data.
  const [following, setFollowing] = useState<MediaItem[]>([]);
  const advancedRef = useRef(false);
  useEffect(() => {
    advancedRef.current = false;
    setFollowing([]);
    let cancelled = false;
    client
      .followingEpisodes(item.id)
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
    nav.swap('player', { item: next });
  }, [next, nav]);
  const onPlayItem = useCallback(
    (i: UpNextItem) => {
      const full = up.byId.get(i.id);
      if (full) nav.swap('player', { item: full });
    },
    [up.byId, nav],
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
  });

  // Intro window (episodes only).
  const intro = useMemo(() => (item.markers ?? []).find((m) => m.kind === 'intro'), [item.markers]);
  const introActive =
    intro != null && pb.cur * 1000 >= intro.startMs && pb.cur * 1000 < intro.endMs;

  useEffect(() => {
    if (pb.surface === 'video' || !pb.ready) return;
    return revealNativeSurface();
  }, [pb.surface, pb.ready]);

  const warn = playerWarn(pb, item, t);

  const nextTitle = next
    ? {
        title: next.episodeTitle ?? next.title,
        subtitle:
          next.season != null && next.episode != null
            ? `S${next.season} E${next.episode}`
            : undefined,
        posterUrl: client.backdropFor(next, UP_NEXT_ART_W) ?? client.posterFor(next, UP_NEXT_ART_W),
      }
    : null;

  // Targets exactly what is playing: for a series, the episode, not the show.
  const onReport = useCallback(
    async (category: ReportCategory) => {
      await client.createReport({
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
      subtitle={subtitle}
      warn={warn}
      markers={item.markers ?? undefined}
      tileAt={tileAt}
      appearance={appearance}
      onAppearanceChange={setAppearance}
      subtitleGen={subtitleGen}
      onReport={onReport}
      upNext={up.data}
      onPlayItem={onPlayItem}
      onPlayNext={next ? goNext : undefined}
      nextTitle={nextTitle}
      introActive={introActive}
      onSkipIntro={intro ? () => pb.seekTo(intro.endMs / 1000) : undefined}
      onClose={nav.back}
    >
      <Player.Media>
        <PlayerSurface pb={pb} title={item.title} />
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
              onPress={nav.back}
              style={{ borderRadius: 999, marginTop: 8 }}
              autoFocus
            />
          </Box>
        </Player.Panel>
      ) : null}
    </Player.Root>
  );
}
