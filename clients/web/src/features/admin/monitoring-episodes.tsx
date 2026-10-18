import type { LedgerEpisode } from '@kromatv/client/requests';
import { datedDayLabel, episodeTag, sizedImageUrl } from '@kromatv/core';
import { ModuleSlot } from '@kromatv/module-sdk';
import { useLocale, useT } from '@kromatv/ui';
import { Badge, Box, Icon, Row, styles, Table, Text, useStyles } from '@kromatv/ui/kit';
import { FollowToggle } from '#web/features/admin/monitoring-follow-toggle';
import { type EpisodeState, episodeState, fileLabel } from '#web/features/admin/monitoring-model';
import { Image } from '#web/shared/ui';

const STATE_TONES = {
  available: 'success',
  grabbed: 'info',
  missing: 'warning',
  untracked: 'neutral',
  upcoming: 'neutral',
} as const satisfies Record<EpisodeState, string>;

const STILL_H = 54;

const COLUMNS = [
  { width: 60 },
  { width: 96, from: 'md' },
  { width: 76 },
  { flex: 1, min: 110 },
  { width: 112, from: 'md' },
  { width: 124, from: 'lg' },
  { width: 104, align: 'end' },
  { width: 88 },
] as const;

const sDefinition = styles({
  tag: { fontVariant: ['tabular-nums'] },
  unnamed: { fontStyle: 'italic' },
});

export function EpisodeTable({
  episodes,
  tmdbId,
  title,
  today,
  followed,
  isSaving,
  onToggle,
}: Readonly<{
  episodes: readonly LedgerEpisode[];
  tmdbId: number;
  title: string;
  today: string;
  followed: boolean;
  isSaving: (unit: { season: number; episode: number }) => boolean;
  onToggle: (episode: LedgerEpisode, monitored: boolean) => void;
}>) {
  const t = useT();
  return (
    <Table.Root variant="plain" label={t('monitoring.episodes')} columns={COLUMNS}>
      <Table.Header>
        <Table.Row>
          <Table.Cell>{t('monitoring.colFollowed')}</Table.Cell>
          <Table.Cell />
          <Table.Cell>{t('monitoring.colEpisode')}</Table.Cell>
          <Table.Cell>{t('monitoring.colName')}</Table.Cell>
          <Table.Cell>{t('monitoring.colAired')}</Table.Cell>
          <Table.Cell>{t('monitoring.colFile')}</Table.Cell>
          <Table.Cell>{t('monitoring.colState')}</Table.Cell>
          <Table.Cell />
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {episodes.map((episode) => (
          <EpisodeRow
            key={`${episode.season}-${episode.episode}`}
            episode={episode}
            tmdbId={tmdbId}
            title={title}
            today={today}
            followed={followed}
            saving={isSaving(episode)}
            onToggle={onToggle}
          />
        ))}
      </Table.Body>
    </Table.Root>
  );
}

function EpisodeRow({
  episode,
  tmdbId,
  title,
  today,
  followed,
  saving,
  onToggle,
}: Readonly<{
  episode: LedgerEpisode;
  tmdbId: number;
  title: string;
  today: string;
  followed: boolean;
  saving: boolean;
  onToggle: (episode: LedgerEpisode, monitored: boolean) => void;
}>) {
  const s = useStyles(sDefinition);
  const t = useT();
  const locale = useLocale();
  const tag = episodeTag(episode);
  const monitored = episode.wantedId !== null;
  const locked = episode.heldByRequest;
  const state = episodeState(episode, today);
  const file = fileLabel(episode.video);
  const blocked = locked ? t('monitoring.heldByRequest') : undefined;
  const reason = followed ? blocked : t('monitoring.seasonsLocked');
  return (
    <Table.Row>
      <Table.Cell>
        <FollowToggle
          state={monitored ? 'on' : 'off'}
          name={`${tag} · ${title}`}
          busy={saving}
          disabled={!followed || locked}
          reason={reason}
          onToggle={(next) => onToggle(episode, next)}
        />
      </Table.Cell>
      <Table.Cell>
        <Box h={STILL_H} radius="xs" overflow="hidden" bg="tint/6" center>
          {episode.stillUrl ? (
            <Image src={sizedImageUrl(episode.stillUrl, 192)} fit="cover" fill />
          ) : (
            <Icon name="photo" size={18} color="textMuted" />
          )}
        </Box>
      </Table.Cell>
      <Table.Cell>
        <Text variant="meta" font="mono" color="textDim" style={s.tag}>
          {tag}
        </Text>
      </Table.Cell>
      <Table.Cell>
        {episode.name ? (
          <Text variant="meta" color={monitored ? 'text' : 'textMuted'} lines={1}>
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
          {episode.airDate
            ? datedDayLabel(episode.airDate, locale)
            : t('monitoring.episodeDateUnknown')}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Text variant="meta" color="textMuted" lines={1}>
          {file ?? ''}
        </Text>
      </Table.Cell>
      <Table.Cell>
        <Row gap={6} align="center">
          {locked ? <Icon name="lock" size={13} color="textMuted" /> : null}
          <Badge tone={STATE_TONES[state]}>{t(`monitoring.st.${state}`)}</Badge>
        </Row>
      </Table.Cell>
      <Table.Cell>
        <Box align="flex-end">
          <ModuleSlot
            name="monitoring.search"
            kind="show"
            tmdbId={tmdbId}
            title={title}
            season={episode.season}
            episode={episode.episode}
            compact
          />
        </Box>
      </Table.Cell>
    </Table.Row>
  );
}
