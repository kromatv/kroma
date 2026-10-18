import type { EpisodeMonitoringBody } from '@kromatv/client/monitoring';
import type { LedgerSeason } from '@kromatv/client/requests';
import { useT } from '@kromatv/ui';
import {
  Box,
  Checkbox,
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
} from '@kromatv/ui/kit';
import { useState } from 'react';
import { EpisodeTable } from '#web/features/admin/monitoring-episodes';
import { useSeasonLedger } from '#web/features/admin/use-monitoring';

const s = styles({
  header: { row: true, align: 'center', gap: 12, flex: true, minW: 0, pr: 14, py: 12 },
});

export function SeasonList({
  tmdbId,
  seasons,
  today,
  busy,
  onEpisodes,
}: Readonly<{
  tmdbId: number;
  seasons: readonly LedgerSeason[];
  today: string;
  busy: boolean;
  onEpisodes: (body: EpisodeMonitoringBody) => void;
}>) {
  const t = useT();
  if (seasons.length === 0) {
    return (
      <Surface radius="xl" pad="lg" border="border">
        <EmptyState.Root icon="list">
          <EmptyState.Title>{t('monitoring.noSeasons')}</EmptyState.Title>
          <EmptyState.Hint>{t('monitoring.noSeasonsHint')}</EmptyState.Hint>
        </EmptyState.Root>
      </Surface>
    );
  }
  return (
    <Box gap={10}>
      {seasons.map((season, index) => (
        <SeasonCard
          key={season.season}
          tmdbId={tmdbId}
          season={season}
          today={today}
          busy={busy}
          defaultOpen={index === 0 && seasons.length === 1}
          onEpisodes={onEpisodes}
        />
      ))}
    </Box>
  );
}

function SeasonCard({
  tmdbId,
  season,
  today,
  busy,
  defaultOpen,
  onEpisodes,
}: Readonly<{
  tmdbId: number;
  season: LedgerSeason;
  today: string;
  busy: boolean;
  defaultOpen: boolean;
  onEpisodes: (body: EpisodeMonitoringBody) => void;
}>) {
  const t = useT();
  const [open, setOpen] = useState(defaultOpen);
  const { data, isPending, isError } = useSeasonLedger(tmdbId, season.season, open);
  const name =
    season.season === 0
      ? t('monitoring.specials')
      : t('monitoring.seasonLabel', { number: season.season });
  const partly = season.requested > 0 && season.requested < season.episodeCount;

  return (
    <Surface pad="none" radius="xl" border="border" overflow="hidden">
      <Row minW={0} align="center">
        <Box pl={14} justify="center">
          <Checkbox
            checked={season.requested > 0}
            indeterminate={partly}
            onCheckedChange={(monitored) =>
              onEpisodes({ seasons: [{ season: season.season, monitored }] })
            }
            label={t('monitoring.seasonSwitch', { number: season.season })}
            disabled={busy}
          />
        </Box>
        <Focusable
          expanded={open}
          onPress={() => setOpen((on) => !on)}
          label={name}
          ring="focusInset"
          style={s.header}
        >
          <Box flex minW={0}>
            <Text variant="label" lines={1}>
              {name}
            </Text>
            <Text variant="meta" color="textDim" mt={2}>
              {t('monitoring.seasonCounts', {
                monitored: season.requested,
                onDisk: season.onDisk,
              })}
            </Text>
          </Box>
          <SeasonProgress season={season} />
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color="textMuted" />
        </Focusable>
      </Row>

      {open ? <Divider spacing={0} /> : null}
      {open && isPending ? (
        <Row center py={18}>
          <Spinner size={18} />
        </Row>
      ) : null}
      {open && isError ? (
        <Text variant="meta" color="danger" px={14} py={14}>
          {t('monitoring.seasonFailed')}
        </Text>
      ) : null}
      {open && data ? (
        <EpisodeTable episodes={data.episodes} today={today} busy={busy} onEpisodes={onEpisodes} />
      ) : null}
    </Surface>
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
      />
    </Box>
  );
}
