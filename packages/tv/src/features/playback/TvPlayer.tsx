import {
  audioSupport,
  type MediaItem,
  playerSubtitle,
  type ReportCategory,
  type Translate,
} from '@kroma/core';
import { Player, TV_FLAGS, type UpNextItem, useSubtitleAppearance, useT } from '@kroma/ui';
import { Box, Button, Icon, Txt } from '@kroma/ui/kit';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEnv } from '#tv/app/providers/env';
import { useClient, useNav, useParams } from '#tv/app/router';
import { PlayerSurface } from '#tv/features/playback/player/PlayerSurface';
import type { Playback } from '#tv/features/playback/player/useDirectPlayback';
import { useNowPlaying } from '#tv/features/playback/player/useNowPlaying';
import { useStoryboard } from '#tv/features/playback/player/useStoryboard';
import { useTvController } from '#tv/features/playback/use-tv-controller';
import { useTvUpNext } from '#tv/features/playback/use-tv-upnext';

/** Scrub-preview thumbnail width (px); the storyboard tile keeps 16:9. */
const PREVIEW_W = 256;

/** Warning pill text, by priority: stream/codec error -> direct-play verdict
 * (in-page surface only) -> audio support. Null when nothing to warn about. */
function playerWarn(pb: Playback, item: MediaItem, t: Translate): string | null {
  if (pb.error) return t(pb.error);
  if (pb.surface === 'video' && pb.verdict && !pb.verdict.canDirectPlay)
    return t(pb.verdict.messageKey, pb.verdict.messageVars);
  const audio = audioSupport(item);
  if (!audio.canPlay && audio.messageKey) return t(audio.messageKey, audio.messageVars);
  return null;
}

/**
 * The TV player: a thin wrapper adapting the native-plane engine to the shared
 * unified `<Player>` (packages/ui/src/player), with TV feature flags (no volume /
 * PiP / fullscreen). All chrome + D-pad interaction live in the shared component;
 * this handles the surface plane, the "up next" series autoplay and the OS
 * now-playing widget.
 */
export function TvPlayer() {
  const nav = useNav();
  const { item } = useParams('player');
  const client = useClient();
  const t = useT();
  // Reveal-on-pointer only with a real desktop mouse; a TV magic remote is a fine
  // pointer but emits phantom pointermove that would pin the chrome open, so there
  // the D-pad drives reveal and the chrome auto-hides on idle (see env.mousePointer).
  const { mousePointer } = useEnv();
  const playerFlags = useMemo(() => ({ ...TV_FLAGS, pointer: mousePointer }), [mousePointer]);

  const { controller, pb, subtitleGen } = useTvController(client, item);
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
  const up = useTvUpNext(client, item, following);

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

  // Native planes (mpv / ExoPlayer / AVPlay) render behind the page, so it must be
  // transparent once a fresh frame is up (kept opaque while loading).
  useEffect(() => {
    const native = pb.surface !== 'video';
    // biome-ignore lint/style/noRestrictedGlobals: audited - the typeof guard returns before this on native, where there is no page to make transparent.
    if (!native || !pb.ready || typeof document === 'undefined') return;
    // biome-ignore lint/style/noRestrictedGlobals: audited - unreachable on native, the typeof guard above returns first.
    const el = document.documentElement;
    el.classList.add('kroma-native-surface');
    return () => el.classList.remove('kroma-native-surface');
  }, [pb.surface, pb.ready]);

  const warn = playerWarn(pb, item, t);

  const nextTitle = next
    ? {
        title: next.episodeTitle ?? next.title,
        subtitle:
          next.season != null && next.episode != null
            ? `S${next.season} E${next.episode}`
            : undefined,
        posterUrl: client.backdropFor(next) ?? client.posterFor(next),
      }
    : null;

  const surface = <PlayerSurface pb={pb} title={item.title} />;

  // Reporting from inside the player targets exactly what is playing, which for
  // a series is the EPISODE, not the show: the whole reason a viewer reaches for
  // this mid-film is that this file is broken.
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
    <Player
      controller={controller}
      flags={playerFlags}
      title={item.title}
      subtitle={subtitle}
      warn={warn}
      markers={item.markers ?? undefined}
      tileAt={tileAt}
      appearance={appearance}
      onAppearance={setAppearance}
      subtitleGen={subtitleGen}
      onReport={onReport}
      upNext={up.data}
      onPlayItem={onPlayItem}
      onPlayNext={next ? goNext : undefined}
      nextTitle={nextTitle}
      intro={
        intro ? { active: introActive, onSkip: () => pb.seekTo(intro.endMs / 1000) } : undefined
      }
      surface={surface}
      onClose={nav.back}
      terminated={
        pb.terminated != null ? (
          <Box fill z={80} center gap={24} px={64} bg="rgba(0, 0, 0, 0.92)">
            <Icon name="player-stop-filled" size={64} color="#E8536A" />
            <Txt variant="h1" style={{ fontSize: 30, textAlign: 'center' }} color="#FFFFFF">
              {t('player.stoppedTitle')}
            </Txt>
            <Txt
              style={{ fontSize: 18, lineHeight: 27, textAlign: 'center', maxWidth: 672 }}
              color="rgba(244, 243, 240, 0.72)"
            >
              {pb.terminated || t('player.stoppedDefault')}
            </Txt>
            <Button
              icon="chevron-left"
              label={t('player.back')}
              onPress={nav.back}
              style={{ borderRadius: 999, marginTop: 8 }}
              autoFocus
            />
          </Box>
        ) : null
      }
    />
  );
}
