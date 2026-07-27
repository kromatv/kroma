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

/** Genre picker: every genre in the library (movies + shows), most common first.
 * Selecting one drills into {@link TvGenreGrid}. Derives the genre list from the
 * already-loaded catalogue: no extra request, like {@link TvPerson}. Each card is
 * fronted by the genre's best-rated backdrop, washed in its signature colour. */
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
          {/* The field WRAPS on screen, so it is a grid, and it has to be
              declared as one: a single row would leave Up and Down with nowhere
              to go and make Right walk all twenty-odd genres in a line. One
              region per visible line, exactly what the eye sees. */}
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

/** One genre tile. The arrangement - artwork, wash, label block - is the kit's
 * `<CategoryTile>`; what stays here is the part that is actually about genres,
 * which is where each hue comes from. */
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
  /** Marks this card the screen's focus entry point. */
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

/** 1792pt of content fits five 340pt cards with 12pt gaps, which is what the
 * wrap produces on the 1920 stage. Declared rather than measured: the stage is
 * fixed, and the navigator needs the shape before anything is laid out. */
const GENRE_COLUMNS = 5;

const GENRE_LINE = { flexDirection: 'row' as const, gap: 12 };

/** Split a list into lines of `size`, so each visible line can be a row. */
function lines<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let at = 0; at < items.length; at += size) out.push(items.slice(at, at + size));
  return out;
}

/** The page scroller's own box: the navigator scrolls it to follow focus. */
const GENRE_SCROLL = { flex: 1, minHeight: 0 } as const;

/** The padding belongs to the CONTENT, not to the scroller's own box: on the
 * box it would pad the viewport and clip the last row instead of the list. */
const GENRE_CONTENT = {
  paddingHorizontal: 64,
  paddingTop: 8,
  paddingBottom: 72,
  gap: 12,
} as const;

/** A genre card is drawn 340pt wide; 320 is the rendition bucket just under it. */
const CARD_W = 320;
