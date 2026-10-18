import type { EpisodeMonitoringBody } from '@kromatv/client/monitoring';
import type { LedgerEpisode } from '@kromatv/client/requests';
import { datedDayLabel, episodeTag } from '@kromatv/core';
import { useLocale, useT } from '@kromatv/ui';
import { Badge, Box, Checkbox, styles, Table, Text } from '@kromatv/ui/kit';
import { type EpisodeState, episodeState, fileLabel } from '#web/features/admin/monitoring-model';

const COLUMNS = [
  { width: 30 },
  { width: 64 },
  { flex: 1, min: 90 },
  { width: 118, from: 'md' },
  { width: 126, from: 'lg' },
  { width: 110, align: 'end' },
] as const;

const STATE_TONES = {
  available: 'success',
  grabbed: 'info',
  missing: 'warning',
  untracked: 'neutral',
  upcoming: 'neutral',
} as const satisfies Record<EpisodeState, string>;

const s = styles({
  tag: { fontVariant: ['tabular-nums'] },
  unnamed: { fontStyle: 'italic' },
});

export function EpisodeTable({
  episodes,
  today,
  busy,
  onEpisodes,
}: Readonly<{
  episodes: readonly LedgerEpisode[];
  today: string;
  busy: boolean;
  onEpisodes: (body: EpisodeMonitoringBody) => void;
}>) {
  const t = useT();
  return (
    <Box px={14} pb={6}>
      <Table.Root variant="plain" label={t('monitoring.episodes')} columns={COLUMNS}>
        <Table.Body>
          {episodes.map((episode) => (
            <EpisodeRow
              key={`${episode.season}-${episode.episode}`}
              episode={episode}
              today={today}
              busy={busy}
              onToggle={(monitored) =>
                onEpisodes({
                  episodes: [{ season: episode.season, episode: episode.episode, monitored }],
                })
              }
            />
          ))}
        </Table.Body>
      </Table.Root>
    </Box>
  );
}

function EpisodeRow({
  episode,
  today,
  busy,
  onToggle,
}: Readonly<{
  episode: LedgerEpisode;
  today: string;
  busy: boolean;
  onToggle: (monitored: boolean) => void;
}>) {
  const t = useT();
  const locale = useLocale();
  const tag = episodeTag(episode);
  const state = episodeState(episode, today);
  const file = fileLabel(episode.video);
  return (
    <Table.Row>
      <Table.Cell>
        <Checkbox
          checked={episode.wantedId !== null}
          onCheckedChange={onToggle}
          label={t('monitoring.episodeSwitch', { tag })}
          disabled={busy}
        />
      </Table.Cell>
      <Table.Cell>
        <Text variant="meta" font="mono" color="accent" style={s.tag}>
          {tag}
        </Text>
      </Table.Cell>
      <Table.Cell>
        {episode.name ? (
          <Text variant="meta" color="text" lines={1}>
            {episode.name}
          </Text>
        ) : (
          <Text variant="meta" color="textMuted" lines={1} style={s.unnamed}>
            {t('monitoring.episodeUnnamed')}
          </Text>
        )}
      </Table.Cell>
      <Table.Cell>
        <Text variant="meta" color="textDim" lines={1}>
          {episode.airDate ? datedDayLabel(episode.airDate, locale) : ''}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Text variant="meta" color="textMuted" lines={1}>
          {file ?? ''}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Badge tone={STATE_TONES[state]}>{t(`monitoring.st.${state}`)}</Badge>
      </Table.Cell>
    </Table.Row>
  );
}
