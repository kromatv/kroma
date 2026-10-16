import type { EpisodeMonitoringBody } from '@kromatv/client/monitoring';
import type { LedgerSeason } from '@kromatv/client/requests';
import { useT } from '@kromatv/ui';
import {
  Box,
  Divider,
  EmptyState,
  Focusable,
  Icon,
  Row,
  Spinner,
  Surface,
  Switch,
  styles,
  Text,
} from '@kromatv/ui/kit';
import { useState } from 'react';
import { EpisodeRows } from '#web/features/admin/monitoring-episodes';
import { useSeasonLedger } from '#web/features/admin/use-monitoring';

const s = styles({
  header: { row: true, align: 'center', gap: 14, flex: true, minW: 0, p: 14 },
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
      <Surface elevated radius="xl" pad="lg">
        <EmptyState.Root icon="list">
          <EmptyState.Title>{t('monitoring.noSeasons')}</EmptyState.Title>
          <EmptyState.Hint>{t('monitoring.noSeasonsHint')}</EmptyState.Hint>
        </EmptyState.Root>
      </Surface>
    );
  }
  return (
    <Box gap={10}>
      <Text variant="overline" color="textDim">
        {t('monitoring.seasons')}
      </Text>
      {seasons.map((season) => (
        <SeasonCard
          key={season.season}
          tmdbId={tmdbId}
          season={season}
          today={today}
          busy={busy}
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
  onEpisodes,
}: Readonly<{
  tmdbId: number;
  season: LedgerSeason;
  today: string;
  busy: boolean;
  onEpisodes: (body: EpisodeMonitoringBody) => void;
}>) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { data, isPending, isError } = useSeasonLedger(tmdbId, season.season, open);
  const name =
    season.season === 0
      ? t('monitoring.specials')
      : t('monitoring.seasonLabel', { number: season.season });

  return (
    <Surface pad="none" radius="xl" border="border" overflow="hidden">
      <Row minW={0}>
        <Focusable
          expanded={open}
          onPress={() => setOpen((on) => !on)}
          label={name}
          ring="focusInset"
          style={s.header}
        >
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color="textMuted" />
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
        </Focusable>
        <Box px={14} justify="center">
          <Switch
            checked={season.requested > 0}
            onCheckedChange={(monitored) =>
              onEpisodes({ seasons: [{ season: season.season, monitored }] })
            }
            label={t('monitoring.seasonSwitch', { number: season.season })}
            disabled={busy}
          />
        </Box>
      </Row>

      {open ? <Divider color="tint/6" /> : null}
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
        <EpisodeRows episodes={data.episodes} today={today} busy={busy} onEpisodes={onEpisodes} />
      ) : null}
    </Surface>
  );
}
