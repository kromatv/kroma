import {
  collectGenres,
  type GenreCount,
  genreAccent,
  genreColors,
  genreLabel,
  genreShowcases,
  genreTint,
} from '@kroma/core';
import { useT } from '@kroma/ui';
import {
  Box,
  CategoryTile,
  FocusScroll,
  Grid,
  genreIcon,
  styles,
  Text,
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
        <Text variant="hero" style={TITLE}>
          {t('nav.genres')}
        </Text>
      </Box>

      {genres.length ? (
        <FocusScroll style={s.scroll} contentStyle={s.content} offsetFromStart={120}>
          <Grid min={CARD_MIN} gap={GAP}>
            {genres.map((g, index) => {
              const pick = showcases.get(g.slug);
              return (
                <GenreCard
                  autoFocus={index === 0}
                  key={g.slug}
                  genre={g}
                  count={t('person.titleCount', { count: g.count })}
                  backdrop={pick ? client.backdropFor(pick, CARD_MIN) : null}
                  onPress={() => nav.go('genre', { slug: g.slug })}
                />
              );
            })}
          </Grid>
        </FocusScroll>
      ) : (
        <Box flex center px={64}>
          <Text variant="leadTv" textAlign="center" maxW={640} color="textDim">
            {t('genres.empty')}
          </Text>
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
  const t = useT();
  return (
    <CategoryTile
      label={genreLabel(t, genre.name)}
      icon={genreIcon(genre.slug)}
      meta={count}
      art={backdrop}
      background={tintGradient(genreColors(genre.slug))}
      wash={genreTint(genre.slug)}
      accent={genreAccent(genre.slug)}
      onPress={onPress}
      autoFocus={autoFocus}
    />
  );
}

// The design's card at 1920 (5 across the content width), as the narrowest one
// rather than a count: a wider window earns a sixth column instead of stretching
// five, a narrower one drops to four instead of running off the edge.
const CARD_MIN = 320;

// One number for both directions: the lines' own gap and the gap BETWEEN them
// are the same seam.
const GAP = 12;

const s = styles({
  scroll: { flex: true, minH: 0 },
  // Padding belongs on the content, not the scroller box: on the box it would
  // pad the viewport and clip the last row instead of the list.
  content: { px: 64, pt: 32, pb: 72, gap: GAP },
});
