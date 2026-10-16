import type { EpisodeMonitoringBody } from '@kromatv/client/monitoring';
import type { LedgerEpisode } from '@kromatv/client/requests';
import { episodeTag } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { Badge, Box, Divider, Row, Switch, Text } from '@kromatv/ui/kit';
import { type EpisodeState, episodeState } from '#web/features/admin/monitoring-model';
import { qualityBadges } from '#web/shared/lib/quality-badges';

const STATE_TONES = {
  available: 'success',
  grabbed: 'info',
  missing: 'warning',
  untracked: 'neutral',
  upcoming: 'neutral',
} as const satisfies Record<EpisodeState, string>;

export function EpisodeRows({
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
  return (
    <Box>
      {episodes.map((episode, index) => (
        <Box key={`${episode.season}-${episode.episode}`}>
          {index > 0 ? <Divider color="tint/4" /> : null}
          <EpisodeRow
            episode={episode}
            today={today}
            busy={busy}
            onToggle={(monitored) =>
              onEpisodes({
                episodes: [{ season: episode.season, episode: episode.episode, monitored }],
              })
            }
          />
        </Box>
      ))}
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
  const tag = episodeTag(episode);
  const state = episodeState(episode, today);
  return (
    <Row gap={14} align="center" px={14} py={10} minW={0}>
      <Switch
        checked={episode.wantedId !== null}
        onCheckedChange={onToggle}
        label={t('monitoring.episodeSwitch', { tag })}
        disabled={busy}
      />
      <Text variant="meta" font="mono" color="accent" w={62} shrink={0}>
        {tag}
      </Text>
      <Box flex minW={0}>
        <Text variant="meta" color="text" lines={1}>
          {episode.name ?? t('monitoring.episodeUnnamed')}
        </Text>
      </Box>
      <Row gap={6} align="center" shrink={0} wrap justify="flex-end">
        {qualityBadges(episode.video).map((badge) => (
          <Badge key={badge} tone={badge}>
            {badge}
          </Badge>
        ))}
        <Badge tone={STATE_TONES[state]}>{t(`monitoring.st.${state}`)}</Badge>
      </Row>
    </Row>
  );
}
