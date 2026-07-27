import { useT } from '@kroma/ui';
import { Box, FocusScroll, Grid, Hint, PosterCard, Txt } from '@kroma/ui/kit';
import type { ReactNode } from 'react';

/** One result, already reduced to what a poster needs. */
export interface SearchResult {
  id: string;
  title: string;
  badge: string | null;
  poster: string;
  colors: [string, string];
  onOpen: () => void;
}

interface TvSearchResultsProps {
  hits: SearchResult[];
  /** The query behind these hits, which decides which empty state is right:
   * nothing typed yet, or nothing found. */
  query: string;
  /** Room available, gutters included. The on-screen-keyboard layout knows this
   * up front; the platform chromes only say it once they have been laid out. */
  width: number;
  onOpen: (hit: SearchResult) => void;
  /** Rendered above the grid, inside the same scroller: the platform chromes
   * have nowhere else to put the recent searches. */
  header?: ReactNode;
}

/** The results half of the search screen, shared by both chromes (our on-screen
 * keyboard and the platform's own), so the two only ever differ in how the query
 * is typed. */
export function TvSearchResults({
  hits,
  query,
  width,
  onOpen,
  header,
}: Readonly<TvSearchResultsProps>) {
  const t = useT();
  // Posters read best around 280pt wide, and the room varies: 1180pt beside our
  // keyboard, whatever tvOS leaves beside its own.
  const columns = Math.max(2, Math.floor((width + GAP) / (POSTER + GAP)));

  return (
    <FocusScroll style={RESULTS_SCROLL} offsetFromStart={80}>
      {header}
      <Box row wrap align="center" gap={14} mb={18}>
        <Txt style={{ fontSize: 15, fontWeight: '700', letterSpacing: 0.6 }} color="textMuted">
          {t('search.results')}
        </Txt>
        <Hint
          text={t('search.hint')}
          size={12}
          gap={3}
          color="rgba(244, 243, 240, 0.34)"
          textStyle={{ fontWeight: '600' }}
        />
      </Box>
      {hits.length ? (
        <Grid width={width} columns={columns} gap={GAP}>
          {hits.map((h) => (
            <PosterCard
              key={h.id}
              title={h.title}
              art={h.poster}
              tint={h.colors}
              onPress={() => onOpen(h)}
            />
          ))}
        </Grid>
      ) : (
        <Txt
          style={{ fontSize: 17, fontWeight: '500', paddingTop: 20 }}
          color="rgba(244, 243, 240, 0.4)"
        >
          {query.trim() ? t('search.noResults') : t('search.empty')}
        </Txt>
      )}
    </FocusScroll>
  );
}

const GAP = 24;
const POSTER = 277;

/** The page scroller's own box: the navigator scrolls it to follow focus. */
const RESULTS_SCROLL = { flex: 1, minHeight: 0 } as const;
