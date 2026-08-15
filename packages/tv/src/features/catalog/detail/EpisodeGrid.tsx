// A season's episodes, one to a line, rendered in growing chunks: what costs
// frames on a television is the number of mounted controls, and a 100-episode
// season at three controls a row is 300 of them.

import type { MediaItem } from '@kroma/core';
import { Grid, useGrowingCount } from '@kroma/ui/kit';
import { EPISODE_COLUMNS, EPISODE_W, EpisodeRow } from '#tv/features/catalog/detail/EpisodeRow';
import { CONTENT_W } from '#tv/shared/stage';

const GAP = 24;
const ROW_GAP = 14;

const CHUNK = 8;

export function EpisodeGrid({
  episodes,
  stillFor,
  isWatched,
  progressOf,
  onPlay,
  onToggleWatched,
  onReport,
}: Readonly<{
  episodes: readonly MediaItem[];
  stillFor: (episode: MediaItem, width: number) => string | null;
  isWatched: (id: string) => boolean;
  progressOf: (id: string) => number | null;
  onPlay: (episode: MediaItem) => void;
  onToggleWatched: (id: string) => void;
  onReport: (episode: MediaItem) => void;
}>) {
  const { count, isNearEnd, grow } = useGrowingCount(episodes.length, CHUNK);
  return (
    <Grid width={CONTENT_W} columns={EPISODE_COLUMNS} gap={GAP} rowGap={ROW_GAP}>
      {episodes.slice(0, count).map((ep, index) => (
        <EpisodeRow
          key={ep.id}
          episode={ep}
          still={stillFor(ep, EPISODE_W)}
          watched={isWatched(ep.id)}
          progress={progressOf(ep.id)}
          onPlay={() => onPlay(ep)}
          onToggleWatched={() => onToggleWatched(ep.id)}
          onReport={() => onReport(ep)}
          onFocus={isNearEnd(index) ? grow : undefined}
        />
      ))}
    </Grid>
  );
}
