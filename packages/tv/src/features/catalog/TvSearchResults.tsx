import { useT } from '@kroma/ui';
import { Box, FocusColumn, FocusScroll, Grid, Hint, PosterCard, styles, Text } from '@kroma/ui/kit';
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
  query: string;
  width: number;
  onOpen: (hit: SearchResult) => void;
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
  return (
    <FocusScroll style={s.scroll} offsetFromStart={80}>
      {header}
      <Box row wrap align="center" gap={14} mb={18}>
        <Text variant="strongTv" color="textMuted">
          {t('search.results')}
        </Text>
        <Hint
          text={t('search.hint')}
          size={12}
          gap={3}
          color="text/34"
          textStyle={{ fontWeight: '600' }}
        />
      </Box>
      {hits.length ? (
        // The grid declares its ROWS; this declares the stack of them, so the
        // whole pane is one thing to arrive at from the keyboard beside it
        // rather than a loose pile of rows on the screen's own column.
        <FocusColumn grid>
          <Grid width={width} min={POSTER} gap={GAP}>
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
        </FocusColumn>
      ) : (
        <Text variant="leadTv" pt={20} color="text/40">
          {query.trim() ? t('search.noResults') : t('search.empty')}
        </Text>
      )}
    </FocusScroll>
  );
}

const GAP = 24;
// The SMALLEST poster worth drawing, not the drawn width: the grid fits as many
// of these as the pane holds and then shares the pane between them.
const POSTER = 250;

const s = styles({
  scroll: { flex: true, minH: 0 },
});
