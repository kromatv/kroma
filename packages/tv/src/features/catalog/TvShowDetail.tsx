import { episodeTag, qualityBadgeForVideo, type ShowDetail, type UpNext } from '@kroma/core';
import { useT, useThemeAudio } from '@kroma/ui';
import {
  Box,
  Button,
  Chip,
  FocusRegion,
  FocusSlot,
  Hint,
  Rail,
  Row,
  Spacer,
  Txt,
  useFocusNav,
} from '@kroma/ui/kit';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMyList } from '#tv/app/providers/mylist';
import { useWatched } from '#tv/app/providers/watched';
import { useClient, useNav, useParams } from '#tv/app/router';
import { TvDetailScaffold } from '#tv/features/catalog/detail/DetailScaffold';
import { EpisodeGrid } from '#tv/features/catalog/detail/EpisodeGrid';
import { EPISODE_COLUMN_W } from '#tv/features/catalog/detail/EpisodeRow';
import {
  CastRow,
  EndsAtHint,
  ListButton,
  ReportButton,
  ThemeButton,
  WatchedButton,
} from '#tv/features/catalog/detail/parts';

export function TvShowDetail() {
  const nav = useNav();
  const { show } = useParams('show');
  const client = useClient();
  const t = useT();
  const [detail, setDetail] = useState<ShowDetail | null>(null);
  const [season, setSeason] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const myList = useMyList();
  const watched = useWatched();

  // Per-episode resume progress (mapped by item id) for the episode thumbnails.
  const [epProgress, setEpProgress] = useState<Record<string, number>>({});
  // biome-ignore lint/correctness/useExhaustiveDependencies: show.id intentionally re-fetches when switching shows (the screen is reused on this route); it gates the effect even though the body reads it only indirectly.
  useEffect(() => {
    let cancelled = false;
    client
      .progress()
      .then((entries) => {
        if (cancelled) return;
        const map: Record<string, number> = {};
        for (const e of entries) {
          const dur = e.durationMs ?? 0;
          if (dur > 0 && e.positionMs > 0) {
            map[e.itemId] = Math.min(100, Math.round((e.positionMs / dur) * 100));
          }
        }
        setEpProgress(map);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, show.id]);

  // Marking an episode watched also clears its resume position server-side, so
  // drop the local progress bar with it instead of leaving a stale one under a
  // watched badge.
  const toggleEpisodeWatched = useCallback(
    (id: string) => {
      const nowWatched = !watched.has(id);
      watched.toggle(id);
      if (nowWatched) {
        setEpProgress((cur) => {
          if (cur[id] == null) return cur;
          const { [id]: _gone, ...rest } = cur;
          return rest;
        });
      }
    },
    [watched],
  );

  useFocusNav({ onBack: nav.back, resetKey: detail });

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setSeason(null);
    setError(null);
    client
      .show(show.id)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setSeason(d.seasons[0]?.number ?? null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [client, show.id]);

  const meta = show.metadata;
  const backdrop = client.backdropFor(show) ?? client.showPosterFor(show);
  const theme = useThemeAudio(client.themeFor(show));

  const activeSeason = useMemo(
    () => detail?.seasons.find((s) => s.number === season) ?? detail?.seasons[0] ?? null,
    [detail, season],
  );
  const firstEpisode = activeSeason?.episodes[0] ?? null;

  // "Continue the series": resume in-progress, else next unwatched (per-user,
  // server-computed). Falls back to the first episode while loading.
  const [upNext, setUpNext] = useState<UpNext | null>(null);
  useEffect(() => {
    let cancelled = false;
    client
      .upNext(show.id)
      .then((r) => {
        if (!cancelled) setUpNext(r);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, show.id]);
  const playTarget = upNext?.item ?? firstEpisode;
  const playLabelKey = upNext?.resume ? 'player.resumeEpisode' : 'player.playEpisode';

  const metaLong = [
    show.year ? String(show.year) : null,
    t('content.seasonCount', { count: show.seasonCount }),
    t('content.episodeCount', { count: show.episodeCount }),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <TvDetailScaffold
      id={show.id}
      kind={t('content.series')}
      title={show.title}
      backdrop={backdrop}
      rating={meta?.rating}
      meta={metaLong}
      badge={qualityBadgeForVideo(show.video)}
      overview={meta?.overview}
      // The action row: Left and Right move between the buttons. It belongs to
      // the header rather than to the rows below it, which is why the scaffold
      // takes it as a prop (see TvDetailScaffold).
      actions={
        <FocusRegion style={ACTION_ROW}>
          <Button
            size="lg"
            autoFocus
            icon="player-play-filled"
            disabled={!playTarget}
            label={
              playTarget
                ? t(playLabelKey, {
                    season: playTarget.season ?? 0,
                    episode: playTarget.episode ?? 0,
                  })
                : t('player.play')
            }
            onPress={() => playTarget && nav.go('player', { item: playTarget })}
          />
          <ListButton inList={myList.has(show.id)} onToggle={() => myList.toggle(show.id)} />
          <WatchedButton watched={watched.has(show.id)} onToggle={() => watched.toggle(show.id)} />
          {theme.active ? <ThemeButton muted={theme.muted} onToggle={theme.toggle} /> : null}
          <ReportButton
            onPress={() =>
              nav.go('report', {
                kind: 'show',
                id: show.id,
                title: show.title,
                // The loaded season travels with the route, so the report screen
                // can offer "one episode" without fetching the series again.
                episodes: (activeSeason?.episodes ?? []).map((ep) => ({
                  id: ep.id,
                  label: episodeTag(ep) || `${ep.episode}`,
                })),
              })
            }
          />
        </FocusRegion>
      }
    >
      {/* Match the Play button's target (resume/next episode), not always ep 1. */}
      <EndsAtHint runtimeMs={playTarget?.durationMs} />

      {error ? (
        <Txt variant="title" color="textMuted" style={STATUS}>
          {t('content.loadEpisodesFailed', { error })}
        </Txt>
      ) : null}
      {!detail && !error ? (
        <Txt variant="title" color="textMuted" style={STATUS}>
          {t('content.loadingEpisodes')}
        </Txt>
      ) : null}

      {/* Three <FocusSlot>s, always rendered even while empty. The navigator
          orders siblings by registration order, and these three don't arrive
          together (cast comes from the route immediately, seasons/episodes
          wait on `client.show()`) — without the slots, Down from the actions
          could land on the cast and then jump back up once seasons appeared
          above it. A slot claims its position at first render regardless. */}
      <FocusSlot>
        {detail && detail.seasons.length > 1 ? (
          <Box row align="center" gap={18} mt={30}>
            <Txt style={SEASON_LABEL} color="textMuted">
              {t('content.seasonsHeader')}
            </Txt>
            <Rail inset={12} gap={10}>
              {detail.seasons.map((s) => (
                <Chip
                  key={s.number}
                  variant="surface"
                  focusScale={1.05}
                  active={s.number === activeSeason?.number}
                  label={t('content.season', { number: s.number })}
                  onPress={() => setSeason(s.number)}
                  style={SEASON_CHIP}
                />
              ))}
            </Rail>
          </Box>
        ) : null}
      </FocusSlot>

      {/* Cast for the selected season (TMDB season credits), falling back to the
          show's overall cast until the season is enriched. */}
      <FocusSlot>
        <CastRow cast={activeSeason?.cast?.length ? activeSeason.cast : meta?.cast} />
      </FocusSlot>

      <FocusSlot>
        {activeSeason ? (
          <Box mt={40} gap={18}>
            {/* The design's header line: the label, how far through the season
                you are, and the remote legend pushed to the column's far edge. */}
            <Row gap={18} wrap maxW={EPISODE_COLUMN_W}>
              <Txt style={EPISODES_LABEL} color="rgba(244, 243, 240, 0.55)">
                {t('content.episodesHeader')}
              </Txt>
              <Txt style={EPISODES_PROGRESS} color="rgba(244, 243, 240, 0.34)">
                {t('content.episodesWatched', {
                  watched: activeSeason.episodes.filter((ep) => watched.has(ep.id)).length,
                  count: activeSeason.episodes.length,
                })}
              </Txt>
              <Spacer />
              <Hint
                text={t('content.episodesHint')}
                size={14}
                gap={4}
                color="rgba(244, 243, 240, 0.3)"
                textStyle={EPISODES_HINT}
              />
            </Row>
            <EpisodeGrid
              episodes={activeSeason.episodes}
              stillFor={(ep, w) => client.backdropFor(ep, w) ?? backdrop}
              isWatched={(id) => watched.has(id)}
              progressOf={(id) => epProgress[id] ?? null}
              onPlay={(ep) => nav.go('player', { item: ep })}
              onToggleWatched={toggleEpisodeWatched}
              onReport={(ep) =>
                nav.go('report', {
                  kind: 'episode',
                  id: ep.id,
                  title: [show.title, episodeTag(ep)].filter(Boolean).join(' · '),
                })
              }
            />
          </Box>
        ) : null}
      </FocusSlot>
    </TvDetailScaffold>
  );
}

const STATUS = { marginTop: 24, fontWeight: '400' as const };
const SEASON_LABEL = { fontSize: 15, fontWeight: '700' as const, letterSpacing: 0.6 };
const SEASON_CHIP = { paddingVertical: 9, paddingHorizontal: 20, borderWidth: 0 } as const;
const EPISODES_LABEL = {
  fontSize: 15,
  fontWeight: '700' as const,
  letterSpacing: 0.6,
  textTransform: 'uppercase' as const,
};
const EPISODES_PROGRESS = { fontSize: 15, fontWeight: '500' as const };
const EPISODES_HINT = { fontWeight: '600' as const };
const ACTION_ROW = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 16 };
