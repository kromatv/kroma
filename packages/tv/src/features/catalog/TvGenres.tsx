import {
  collectGenres,
  type GenreCount,
  genreAccent,
  genreColors,
  genreShowcases,
  genreTint,
} from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Box,
  CategoryTile,
  FocusColumn,
  FocusRegion,
  FocusScroll,
  styles,
  Txt,
  tintGradient,
  useFocusNav,
} from '@kroma/ui/kit';
import { useMemo } from 'react';
import { useConnection } from '#tv/app/providers/connection';
import { useClient, useNav } from '#tv/app/router';
import { TITLE } from '#tv/features/catalog/screenStyle';

/** Genre picker: every genre in the library, most common first. Selecting one
 * drills into {@link TvGenreGrid}. Derives the list from the already-loaded
 * catalogue: no extra request, like {@link TvPerson}. */
export function TvGenres() {
  const { movies, shows } = useConnection();
  const client = useClient();
  const t = useT();
  const nav = useNav();
  useFocusNav({ onBack: nav.back });

  const catalogue = useMemo(() => [...movies, ...shows], [movies, shows]);
  const genres = useMemo(() => collectGenres(catalogue), [catalogue]);
  const showcases = useMemo(() => genreShowcases(catalogue), [catalogue]);

  return (
    <Box fill bg="bg" overflow="hidden">
      <Box px={64} pt={112} pb={16}>
        <Txt variant="hero" style={TITLE}>
          {t('nav.genres')}
        </Txt>
      </Box>

      {genres.length ? (
        <FocusScroll style={s.scroll} contentStyle={s.content} offsetFromStart={120}>
          {/* The field wraps on screen, so it must be declared as a grid: a
              single row would leave Up/Down nowhere to go. One region per
              visible line, matching what the eye sees.
              <FocusColumn grid> is what makes the lines a GRID rather than a
              stack: without it the navigator has no index to align on, so
              leaving a line forgets which column you were in and Up/Down land
              on the first card of the next line. */}
          <FocusColumn grid style={s.grid}>
            {lines(genres, GENRE_COLUMNS).map((line, row) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the index IS the line's identity.
              <FocusRegion key={row} style={s.line}>
                {line.map((g, column) => {
                  const pick = showcases.get(g.name);
                  return (
                    <GenreCard
                      autoFocus={row === 0 && column === 0}
                      key={g.name}
                      genre={g}
                      count={t('person.titleCount', { count: g.count })}
                      backdrop={pick ? client.backdropFor(pick, CARD_W) : null}
                      onPress={() => nav.go('genre', { name: g.name })}
                    />
                  );
                })}
              </FocusRegion>
            ))}
          </FocusColumn>
        </FocusScroll>
      ) : (
        <Box flex center px={64}>
          <Txt
            style={{ fontSize: 18, fontWeight: '500', textAlign: 'center', maxWidth: 640 }}
            color="textDim"
          >
            {t('genres.empty')}
          </Txt>
        </Box>
      )}
    </Box>
  );
}

function GenreCard({
  genre,
  count,
  backdrop,
  onPress,
  autoFocus,
}: Readonly<{
  genre: GenreCount;
  count: string;
  backdrop: string | null;
  onPress: () => void;
  autoFocus?: boolean;
}>) {
  return (
    <CategoryTile
      label={genre.name}
      meta={count}
      art={backdrop}
      background={tintGradient(genreColors(genre.name))}
      wash={genreTint(genre.name)}
      accent={genreAccent(genre.name)}
      onPress={onPress}
      autoFocus={autoFocus}
    />
  );
}

// Declared rather than measured: the stage is fixed, and the navigator needs
// the shape before anything is laid out.
const GENRE_COLUMNS = 5;

function lines<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let at = 0; at < items.length; at += size) out.push(items.slice(at, at + size));
  return out;
}

const CARD_W = 320;

// One number for both directions: the lines' own gap and the gap BETWEEN them
// are the same seam, and the grid column is what carries the second one now
// that it stands between the content and its lines.
const GAP = 12;

const s = styles({
  line: { row: true, gap: GAP },
  grid: { gap: GAP },
  scroll: { flex: true, minH: 0 },
  // Padding belongs on the content, not the scroller box: on the box it would
  // pad the viewport and clip the last row instead of the list.
  content: { px: 64, pt: 8, pb: 72, gap: GAP },
});
