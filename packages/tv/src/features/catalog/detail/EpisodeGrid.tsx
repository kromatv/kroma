// A season's episodes, one to a line, spanning the scaffold's content width.
//
// One column, not two: two columns of cards is what turned this screen into a
// table. The full-bleed backdrop stays present through the cards' translucency
// instead of beside them.
//
// Rendered in growing chunks for the same reason the rails are: what costs
// frames on a television is the number of MOUNTED controls, and a 100-episode
// season at three controls a row is 300 of them. The window grows as the focus
// approaches its end and never shrinks - the navigator can only move to a node
// that exists.

import type { MediaItem } from '@kroma/core';
import { Grid, useGrowingCount } from '@kroma/ui/kit';
import {
  EPISODE_COLUMN_W,
  EPISODE_COLUMNS,
  EPISODE_W,
  EpisodeRow,
} from '#tv/features/catalog/detail/EpisodeRow';

const GAP = 24;
/** `gap:14` between rows (design). */
const ROW_GAP = 14;

/** A screenful of rows, plus a couple already in the tree. */
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
  /** Resolves an episode's still (the show's backdrop when it has none). */
  stillFor: (episode: MediaItem, width: number) => string | null;
  isWatched: (id: string) => boolean;
  /** Resume progress in percent, or null when the episode is untouched. */
  progressOf: (id: string) => number | null;
  onPlay: (episode: MediaItem) => void;
  onToggleWatched: (id: string) => void;
  /** Opens the report screen with this one episode as the subject. */
  onReport: (episode: MediaItem) => void;
}>) {
  const { count, isNearEnd, grow } = useGrowingCount(episodes.length, CHUNK);
  return (
    <Grid width={EPISODE_COLUMN_W} columns={EPISODE_COLUMNS} gap={GAP} rowGap={ROW_GAP}>
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
