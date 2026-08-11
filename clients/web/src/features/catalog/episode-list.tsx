// The unified season section: one switcher over ALL seasons; the selected
// season renders its owned, playable episodes (with watched/progress) and/or a
// request card for a missing or partial season, so a partially-owned show
// plays what it has and requests the gaps on one screen.

import type { CastMember, MediaItem } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Box, Button, Chip, Text } from '@kroma/ui/kit';
import { type CSSProperties, useState } from 'react';
import { CastRail } from '#web/features/catalog/detail';
import { EpisodeRow, MissingEpisodeRow } from '#web/features/catalog/episode-row';
import { SeasonRequestCard } from '#web/features/catalog/season-card';
import type { TitleSeason } from '#web/shared/lib/titleView';

// The page gutter is a fluid CSS custom property and `overflow-x` names one
// axis, so both stay plain elements around kit content.
const GUTTER: CSSProperties = {
  paddingLeft: 'var(--gutter-web)',
  paddingRight: 'var(--gutter-web)',
};

// `scrollbar-width` only; the legacy `::-webkit-scrollbar` rule it used to pair
// with needs a stylesheet, which an inline style has no way to reach.
const CHIP_SCROLLER: CSSProperties = {
  ...GUTTER,
  display: 'flex',
  gap: 8,
  overflowX: 'auto',
  scrollbarWidth: 'none',
};

const SECTION: CSSProperties = { marginTop: 40 };

function SeasonSwitcher({
  seasons,
  current,
  onPick,
}: Readonly<{ seasons: TitleSeason[]; current: number; onPick: (n: number) => void }>) {
  const t = useT();
  return (
    <div style={CHIP_SCROLLER}>
      {seasons.map((s) => (
        <Chip
          key={s.number}
          active={s.number === current}
          label={t('content.season', { number: s.number })}
          onPress={() => onPick(s.number)}
        />
      ))}
    </div>
  );
}
export function SeasonSection({
  seasons,
  fallbackCast,
  isWatched,
  toggleWatched,
  progressOf,
  onPlay,
  canRequest,
  onPickSeason,
  onPickAll,
  onRequestEpisode,
  pendingEpisodes,
  requestBusy,
}: Readonly<{
  seasons: TitleSeason[];
  fallbackCast: CastMember[];
  isWatched: (id: string) => boolean;
  toggleWatched: (id: string) => void;
  progressOf: (id: string) => number | null;
  onPlay: (id: string) => void;
  canRequest: boolean;
  onPickSeason: (season: number) => void;
  onPickAll: () => void;
  onRequestEpisode: (season: number, episode: number) => void;
  pendingEpisodes: Set<string>;
  requestBusy: boolean;
}>) {
  const t = useT();
  const [season, setSeason] = useState(seasons[0]?.number ?? 1);
  const current = seasons.find((s) => s.number === season) ?? seasons[0];
  if (!current) return null;
  const hasOpen = canRequest && seasons.some((s) => !s.available && !s.requested);
  const partialCurrent = canRequest && current.episodes.length > 0 && !current.available;

  const { ownedByNum, ordered, perEpisode } = mergeEpisodes(current, canRequest);

  return (
    <section style={SECTION}>
      <div style={GUTTER}>
        <Box row align="center" between gap={12} mb={16}>
          <h2>
            <Text variant="h2">{t('content.episodes')}</Text>
          </h2>
          {hasOpen ? (
            <Button
              variant="outline"
              active
              size="sm"
              icon="plus"
              iconRight="chevron-right"
              label={t('discover.requestSeasons')}
              onPress={onPickAll}
            />
          ) : null}
        </Box>
      </div>

      {seasons.length > 1 ? (
        <Box mb={8}>
          <SeasonSwitcher seasons={seasons} current={current.number} onPick={setSeason} />
        </Box>
      ) : null}

      <CastRail cast={current.cast.length ? current.cast : fallbackCast} />

      {ordered.length > 0 ? (
        <>
          <div style={GUTTER}>
            <Text variant="meta" color="white/45" mt={16} mb={20}>
              {t('content.episodeCount', {
                count: perEpisode ? current.episodeCount : current.episodes.length,
              })}
            </Text>
          </div>
          <SeasonEpisodes
            current={current}
            ordered={ordered}
            ownedByNum={ownedByNum}
            isWatched={isWatched}
            toggleWatched={toggleWatched}
            progressOf={progressOf}
            onPlay={onPlay}
            onRequestEpisode={onRequestEpisode}
            pendingEpisodes={pendingEpisodes}
            requestBusy={requestBusy}
          />
          {partialCurrent ? (
            <Box mt={14}>
              <SeasonRequestCard
                season={current}
                canRequest={canRequest}
                onPick={() => onPickSeason(current.number)}
              />
            </Box>
          ) : null}
        </>
      ) : (
        <Box mt={16}>
          <SeasonRequestCard
            season={current}
            canRequest={canRequest}
            onPick={() => onPickSeason(current.number)}
          />
        </Box>
      )}
    </section>
  );
}

// Missing rows are only enumerated when the viewer can request AND TMDB gave us
// the episode count; otherwise the list stays owned-only.
function mergeEpisodes(
  current: TitleSeason,
  canRequest: boolean,
): { ownedByNum: Map<number, MediaItem>; ordered: number[]; perEpisode: boolean } {
  const ownedByNum = new Map<number, MediaItem>();
  for (const ep of current.episodes) if (ep.episode != null) ownedByNum.set(ep.episode, ep);
  const perEpisode = canRequest && !current.available && current.episodeCount > 0;
  const epNumbers = new Set<number>(ownedByNum.keys());
  if (perEpisode) for (let n = 1; n <= current.episodeCount; n++) epNumbers.add(n);
  const ordered = [...epNumbers].sort((a, b) => a - b);
  return { ownedByNum, ordered, perEpisode };
}

function SeasonEpisodes({
  current,
  ordered,
  ownedByNum,
  isWatched,
  toggleWatched,
  progressOf,
  onPlay,
  onRequestEpisode,
  pendingEpisodes,
  requestBusy,
}: Readonly<{
  current: TitleSeason;
  ordered: number[];
  ownedByNum: Map<number, MediaItem>;
  isWatched: (id: string) => boolean;
  toggleWatched: (id: string) => void;
  progressOf: (id: string) => number | null;
  onPlay: (id: string) => void;
  onRequestEpisode: (season: number, episode: number) => void;
  pendingEpisodes: Set<string>;
  requestBusy: boolean;
}>) {
  return (
    <div style={GUTTER}>
      <Box gap={14}>
        {ordered.map((n) => {
          const owned = ownedByNum.get(n);
          if (owned) {
            return (
              <EpisodeRow
                key={owned.id}
                episode={owned}
                watched={isWatched(owned.id)}
                progress={progressOf(owned.id)}
                onPlay={() => onPlay(owned.id)}
                onToggleWatched={() => toggleWatched(owned.id)}
              />
            );
          }
          return (
            <MissingEpisodeRow
              key={`m-${n}`}
              season={current.number}
              episode={n}
              pending={current.requested || pendingEpisodes.has(`${current.number}-${n}`)}
              busy={requestBusy}
              onRequest={() => onRequestEpisode(current.number, n)}
            />
          );
        })}
      </Box>
    </div>
  );
}
