import type { DiscoverEntry, DiscoverEpisode, DiscoverSeason } from '@kromatv/client/discovery';
import { episodeTag, posterColors, watchableTitle } from '@kromatv/core';
import { useT } from '@kromatv/ui';
import { Box, Chip, MediaCard, RAIL_GAP, Rail, styles, Text } from '@kromatv/ui/kit';
import { useEffect, useState } from 'react';
import { useClient, useNav } from '#tv/app/router';

const TILE_W = 300;
const TILE_H = 190;
const POSTER_W = 1280;

function useSeasonEpisodes(tmdbId: number, season: number | null): DiscoverEpisode[] {
  const client = useClient();
  const [episodes, setEpisodes] = useState<DiscoverEpisode[]>([]);

  useEffect(() => {
    if (season === null) return;
    let live = true;
    setEpisodes([]);
    client.discovery.season(tmdbId, season).then(
      (answer) => {
        if (live) setEpisodes(answer.episodes);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [client, tmdbId, season]);

  return episodes;
}

export function DiscoverSeasons({
  entry,
  seasons,
  playable,
}: Readonly<{
  entry: DiscoverEntry;
  seasons: readonly DiscoverSeason[];
  playable: boolean;
}>) {
  const t = useT();
  const client = useClient();
  const nav = useNav();
  const [chosen, setChosen] = useState<number | null>(null);
  const season = chosen ?? seasons[0]?.season ?? null;
  const episodes = useSeasonEpisodes(entry.tmdbId, season);

  if (seasons.length === 0) return null;
  const poster = client.media.artwork.resolve(entry.posterUrl, POSTER_W);
  const watch = (episode: number) => {
    const title = watchableTitle(entry, { season: season ?? 0, episode });
    if (title) nav.go('watch', { subject: { kind: 'title', title }, poster });
  };

  return (
    <Box mt={36} gap={20}>
      {seasons.length > 1 ? (
        <Box row align="center" gap={18}>
          <Text style={s.label} color="textMuted">
            {t('content.seasonsHeader')}
          </Text>
          <Rail.Root inset={0} gap={10} grow={false}>
            {seasons.map((entryOf) => (
              <Chip
                key={entryOf.season}
                variant="surface"
                focusScale={1.05}
                active={entryOf.season === season}
                pressed={entryOf.season === season}
                label={t('content.season', { number: entryOf.season })}
                onPress={() => setChosen(entryOf.season)}
                style={s.seasonChip}
              />
            ))}
          </Rail.Root>
        </Box>
      ) : null}

      <Text style={s.railTitle} color="text/55">
        {playable ? t('discover.pickEpisode') : t('content.episodesHeader')}
      </Text>
      <Rail.Root inset={0}>
        <Rail.List pitch={TILE_W + RAIL_GAP} height={TILE_H}>
          {episodes.map((episode) => (
            <MediaCard
              key={episode.episode}
              title={episode.title ?? t('requests.episodeUnnamed')}
              overline={episodeTag({ season, episode: episode.episode })}
              art={client.media.artwork.resolve(episode.stillUrl, TILE_W)}
              tint={posterColors(`${entry.tmdbId}:${episode.episode}`)}
              onPress={playable ? () => watch(episode.episode) : undefined}
            />
          ))}
        </Rail.List>
      </Rail.Root>
    </Box>
  );
}

const s = styles({
  label: { fontSize: 15, fontWeight: '700', letterSpacing: 0.6 },
  seasonChip: { py: 9, px: 20, borderWidth: 0 },
  railTitle: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
