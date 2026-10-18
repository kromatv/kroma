import type { LedgerEpisode, LedgerSeason } from '@kromatv/client/requests';
import { datedDayLabel, sizedImageUrl } from '@kromatv/core';
import { ModuleSlot } from '@kromatv/module-sdk';
import { useLocale, useT } from '@kromatv/ui';
import {
  Box,
  Button,
  Callout,
  Divider,
  EmptyState,
  Focusable,
  Icon,
  Progress,
  Row,
  Spinner,
  Surface,
  styles,
  Text,
  useBreakpoint,
  useConfirm,
  useStyles,
} from '@kromatv/ui/kit';
import { useState } from 'react';
import { EpisodeTable } from '#web/features/admin/monitoring-episodes';
import { FollowToggle } from '#web/features/admin/monitoring-follow-toggle';
import { isSpecials, seasonFollow, seasonToOpen } from '#web/features/admin/monitoring-model';
import { type EpisodeUnit, useSeasonLedger } from '#web/features/admin/use-monitoring';
import { Image } from '#web/shared/ui';

const POSTER_W = 36;
const POSTER_H = 54;
const THUMB_COLUMN = 96;
const FOLLOW_COLUMN = 60;
const ROW_PX = 14;

const sDefinition = styles({
  header: { row: true, align: 'center', gap: 12, flex: true, minW: 0, py: 12 },
});

export function useSeasonName(): (season: number) => string {
  const t = useT();
  return (season) =>
    isSpecials(season)
      ? t('monitoring.seasonSpecials')
      : t('monitoring.seasonLabel', { number: season });
}

export function SeasonList({
  tmdbId,
  title,
  poster,
  seasons,
  today,
  followed,
  isSaving,
  onToggle,
}: Readonly<{
  tmdbId: number;
  title: string;
  poster: string | null;
  seasons: readonly LedgerSeason[];
  today: string;
  followed: boolean;
  isSaving: (unit: EpisodeUnit) => boolean;
  onToggle: (unit: EpisodeUnit, monitored: boolean) => void;
}>) {
  const t = useT();
  if (seasons.length === 0) {
    return (
      <Surface radius="xl" pad="lg" border="border">
        <EmptyState.Root icon="list">
          <EmptyState.Title>{t('monitoring.noSeasons')}</EmptyState.Title>
        </EmptyState.Root>
      </Surface>
    );
  }
  const opened = seasonToOpen(seasons);
  return (
    <Box gap={10}>
      {followed ? null : (
        <Text variant="meta" color="textDim">
          {t('monitoring.seasonsLocked')}
        </Text>
      )}
      {seasons.map((season) => (
        <SeasonCard
          key={season.season}
          tmdbId={tmdbId}
          title={title}
          poster={poster}
          season={season}
          today={today}
          followed={followed}
          isSaving={isSaving}
          defaultOpen={season.season === opened}
          onToggle={onToggle}
        />
      ))}
    </Box>
  );
}

function SeasonCard({
  tmdbId,
  title,
  poster,
  season,
  today,
  followed,
  isSaving,
  defaultOpen,
  onToggle,
}: Readonly<{
  tmdbId: number;
  title: string;
  poster: string | null;
  season: LedgerSeason;
  today: string;
  followed: boolean;
  isSaving: (unit: EpisodeUnit) => boolean;
  defaultOpen: boolean;
  onToggle: (unit: EpisodeUnit, monitored: boolean) => void;
}>) {
  const s = useStyles(sDefinition);
  const t = useT();
  const confirm = useConfirm();
  const [open, setOpen] = useState(defaultOpen);
  const { data, isPending, isError, refetch } = useSeasonLedger(tmdbId, season.season, open);
  const name = useSeasonName()(season.season);
  const busy = isSaving({ season: season.season });
  const episodes = data?.episodes ?? [];

  const switchSeason = async (monitored: boolean) => {
    if (!monitored) {
      const ok = await confirm({
        title: t('monitoring.seasonOff', { name }),
        message: t('monitoring.seasonOffHint'),
        confirmLabel: t('monitoring.unfollow'),
        cancelLabel: t('common.cancel'),
        destructive: true,
      });
      if (!ok) return;
    }
    onToggle({ season: season.season }, monitored);
  };

  return (
    <Surface pad="none" radius="xl" border="border" overflow="hidden">
      <Row minW={0} align="center" px={ROW_PX}>
        <Box w={FOLLOW_COLUMN} shrink={0}>
          <FollowToggle
            state={seasonFollow(season)}
            name={`${name} · ${title}`}
            busy={busy}
            disabled={!followed}
            reason={followed ? undefined : t('monitoring.seasonsLocked')}
            onToggle={(next) => void switchSeason(next)}
          />
        </Box>
        <Focusable
          expanded={open}
          onPress={() => setOpen((on) => !on)}
          label={name}
          ring="focusInset"
          style={s.header}
        >
          <Box w={THUMB_COLUMN} shrink={0} align="center">
            <Box w={POSTER_W} h={POSTER_H} radius="xs" overflow="hidden" bg="tint/6">
              <Image src={sizedImageUrl(season.posterUrl ?? poster, 185)} fit="cover" fill />
            </Box>
          </Box>
          <Box flex minW={0}>
            <Text variant="label" lines={1}>
              {name}
            </Text>
            <SeasonMeta season={season} />
          </Box>
          <SeasonProgress season={season} />
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color="textMuted" />
        </Focusable>
        <Box pl={8}>
          <ModuleSlot
            name="monitoring.search"
            kind="show"
            tmdbId={tmdbId}
            title={title}
            season={season.season}
            episode={null}
            compact
          />
        </Box>
      </Row>

      {open ? <Divider spacing={0} /> : null}
      {open && isPending ? (
        <Row center py={18}>
          <Spinner size={18} />
        </Row>
      ) : null}
      {open && isError ? (
        <Box p={14}>
          <Callout.Root tone="danger" icon="alert-triangle">
            <Callout.Title>{t('monitoring.seasonFailed')}</Callout.Title>
            <Callout.Actions>
              <Button
                variant="glass"
                size="sm"
                icon="refresh"
                label={t('error.retry')}
                onPress={() => void refetch()}
              />
            </Callout.Actions>
          </Callout.Root>
        </Box>
      ) : null}
      {open && data && episodes.length === 0 ? <NotListedYet /> : null}
      {open && episodes.length > 0 ? (
        <Box px={ROW_PX} pb={6}>
          <EpisodeTable
            episodes={episodes}
            tmdbId={tmdbId}
            title={title}
            today={today}
            followed={followed}
            isSaving={isSaving}
            onToggle={(episode: LedgerEpisode, monitored: boolean) =>
              onToggle({ season: episode.season, episode: episode.episode }, monitored)
            }
          />
        </Box>
      ) : null}
    </Surface>
  );
}

function NotListedYet() {
  const t = useT();
  return (
    <Box px={ROW_PX} py={18}>
      <EmptyState.Root size="sm" icon="calendar-time">
        <EmptyState.Title>{t('monitoring.seasonNotListed')}</EmptyState.Title>
      </EmptyState.Root>
    </Box>
  );
}

function SeasonMeta({ season }: Readonly<{ season: LedgerSeason }>) {
  const t = useT();
  const locale = useLocale();
  const narrow = useBreakpoint() === 'base';
  if (season.episodeCount === 0) {
    const premiere = season.airDate
      ? t('monitoring.seasonPremiere', { date: datedDayLabel(season.airDate, locale) })
      : t('monitoring.seasonDateUnknown');
    return (
      <Text variant="meta" color="textDim" mt={2}>
        {`${t('monitoring.seasonAnnounced')} · ${premiere}`}
      </Text>
    );
  }
  const parts = [
    season.airDate ? season.airDate.slice(0, 4) : null,
    t('content.episodeCount', { count: season.episodeCount }),
    narrow && season.requested > 0
      ? t('monitoring.seasonHeld', {
          onDisk: Math.min(season.onDisk, season.requested),
          monitored: season.requested,
        })
      : null,
  ].filter(Boolean);
  return (
    <Text variant="meta" color="textDim" mt={2}>
      {parts.join(' · ')}
    </Text>
  );
}

function SeasonProgress({ season }: Readonly<{ season: LedgerSeason }>) {
  const t = useT();
  const narrow = useBreakpoint() === 'base';
  if (season.requested === 0 || narrow) return null;
  const held = Math.min(season.onDisk, season.requested);
  return (
    <Box w={132} gap={6} shrink={0}>
      <Text variant="meta" color="textDim" textAlign="right">
        {t('monitoring.seasonHeld', { onDisk: held, monitored: season.requested })}
      </Text>
      <Progress
        value={held / season.requested}
        thickness={4}
        color={held === season.requested ? 'success' : 'accent'}
        label={t('monitoring.statOnDisk')}
      />
    </Box>
  );
}
