import {
  collectGenres,
  type GenreCount,
  genreAccent,
  genreColors,
  genreShowcases,
  genreTint,
  sizedImageUrl,
} from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Box,
  CategoryTile,
  FocusRegion,
  FocusScroll,
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
        <FocusScroll style={GENRE_SCROLL} contentStyle={GENRE_CONTENT} offsetFromStart={120}>
          {/* The field wraps on screen, so it must be declared as a grid: a
              single row would leave Up/Down nowhere to go. One region per
              visible line, matching what the eye sees. */}
          {lines(genres, GENRE_COLUMNS).map((line, row) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the index IS the line's identity.
            <FocusRegion key={row} style={GENRE_LINE}>
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
      art={sizedImageUrl(backdrop, 328)}
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

const GENRE_LINE = { flexDirection: 'row' as const, gap: 12 };

function lines<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let at = 0; at < items.length; at += size) out.push(items.slice(at, at + size));
  return out;
}

const GENRE_SCROLL = { flex: 1, minHeight: 0 } as const;

// Padding belongs on the content, not the scroller box: on the box it would
// pad the viewport and clip the last row instead of the list.
const GENRE_CONTENT = {
  paddingHorizontal: 64,
  paddingTop: 8,
  paddingBottom: 72,
  gap: 12,
} as const;

const CARD_W = 320;
