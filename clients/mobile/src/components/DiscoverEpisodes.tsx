import type { DiscoverEpisode, DiscoverSeason } from '@kromatv/client/discovery';
import { sizedImageUrl } from '@kromatv/core';
import { Box, Button, styles, Text } from '@kromatv/ui/kit';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type { View } from 'react-native';
import { FadeImage } from '#mobile/components/FadeImage';
import { type PopoverAnchor, PopoverMenu } from '#mobile/components/PopoverMenu';
import { SectionTitle } from '#mobile/components/ui';
import { useT } from '#mobile/lib/i18n';
import { useGutters } from '#mobile/lib/layout';
import { useClient } from '#mobile/lib/session';
import { radius, spacing, type } from '#mobile/lib/theme';

const STILL_W = 480;

function EpisodeRow({ episode }: Readonly<{ episode: DiscoverEpisode }>) {
  const t = useT();
  const client = useClient();
  return (
    <Box style={s.episode}>
      <FadeImage
        uri={sizedImageUrl(client.media.artwork.resolve(episode.stillUrl), STILL_W)}
        seed={String(episode.episode)}
        radius={radius.sm}
        style={s.thumb}
      />
      <Box style={s.text}>
        <Text lines={1} style={s.title}>
          {`${episode.episode}. ${episode.title ?? t('requests.episodeUnnamed')}`}
        </Text>
        {episode.overview ? (
          <Text lines={2} style={s.overview}>
            {episode.overview}
          </Text>
        ) : null}
      </Box>
    </Box>
  );
}

export function DiscoverEpisodes({
  tmdbId,
  seasons,
}: Readonly<{ tmdbId: number; seasons: readonly DiscoverSeason[] }>) {
  const t = useT();
  const client = useClient();
  const gutters = useGutters();
  const [chosen, setChosen] = useState(0);
  const [anchor, setAnchor] = useState<PopoverAnchor | null>(null);
  const button = useRef<View>(null);
  const season = seasons[Math.min(chosen, seasons.length - 1)];
  const episodes = useQuery({
    ...client.query.discovery.season(tmdbId, season?.season ?? 1),
    enabled: season != null,
  });

  if (seasons.length === 0) return null;

  return (
    <Box>
      <SectionTitle>{t('content.episodes')}</SectionTitle>
      <Box style={[s.seasonHeader, gutters.style]}>
        <Button
          ref={button}
          variant="glass"
          size="sm"
          iconRight="chevron-down"
          label={t('content.season', { number: season?.season ?? 1 })}
          onPress={() =>
            button.current?.measureInWindow((x, y, width, height) =>
              setAnchor({ x, y, width, height }),
            )
          }
        />
      </Box>
      <Box style={[s.list, gutters.style]}>
        {(episodes.data?.episodes ?? []).map((episode) => (
          <EpisodeRow key={episode.episode} episode={episode} />
        ))}
      </Box>
      <PopoverMenu
        visible={anchor !== null}
        anchor={anchor}
        onClose={() => setAnchor(null)}
        items={seasons.map((entry, index) => ({
          key: String(entry.season),
          label: t('content.season', { number: entry.season }),
          detail: t('content.episodeCount', { count: entry.episodeCount }),
          active: index === chosen,
          onPress: () => setChosen(index),
        }))}
      />
    </Box>
  );
}

const s = styles({
  seasonHeader: { row: true, align: 'center', mb: spacing.sm },
  list: { gap: 4 },
  episode: { row: true, align: 'center', gap: 12, p: 8, radius: radius.md },
  thumb: { w: 140, h: 79 },
  text: { flex: true, gap: 3 },
  title: { ...type.body, shrink: 1, fontWeight: '600' },
  overview: { ...type.small, color: 'textMuted', lineHeight: 17, fontWeight: '400' },
});
