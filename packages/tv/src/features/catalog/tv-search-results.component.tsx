import { useT } from '@kromatv/ui';
import {
  Box,
  FocusScroll,
  Grid,
  PersonCard,
  PosterCard,
  Rail,
  styles,
  Text,
  TopFade,
  useStyles,
} from '@kromatv/ui/kit';
import type { ReactNode } from 'react';

export interface SearchResult {
  id: string;
  title: string;
  badge: string | null;
  poster: string | null;
  colors: [string, string];
  onOpen: () => void;
  onLongPress?: () => void;
}

export interface SearchSection {
  key: string;
  title: string;
  hits: SearchResult[];
}

export interface SearchPerson {
  id: string;
  name: string;
  photo: string | null;
  titles: number;
  onOpen: () => void;
}

interface TvSearchResultsProps {
  people: readonly SearchPerson[];
  sections: readonly SearchSection[];
  query: string;
  width?: number;
  header?: ReactNode;
}

export function TvSearchResults({
  people,
  sections,
  query,
  width,
  header,
}: Readonly<TvSearchResultsProps>) {
  const s = useStyles(sDefinition);

  const t = useT();
  // Read out here, not in the branch below: inside it `query` joins the grid's
  // own cache guard, and then every keystroke rebuilds every poster.
  const emptyMessage = query.trim() ? t('search.noResults') : t('search.empty');
  const found = sections.filter((section) => section.hits.length > 0);
  return (
    <TopFade style={s.scroll}>
      <FocusScroll style={s.scroll} contentStyle={s.content} offsetFromStart={80}>
        {header}
        <Box row wrap align="center" gap={14} mb={18}>
          <Text variant="strongTv" color="textMuted">
            {t('search.results')}
          </Text>
        </Box>
        {people.length > 0 ? (
          <Box gap={14} mb={34}>
            <Text variant="overlineTv" color="textDim">
              {t('search.people')}
            </Text>
            <Rail.Root inset={6} grow={false}>
              {people.map((person) => (
                <PersonCard
                  key={person.id}
                  name={person.name}
                  role={t('person.titleCount', { count: person.titles })}
                  photo={person.photo}
                  label={t('person.viewWorks', { name: person.name })}
                  onPress={person.onOpen}
                />
              ))}
            </Rail.Root>
          </Box>
        ) : null}
        {found.length === 0 && people.length === 0 ? (
          <Text variant="leadTv" pt={20} color="text/40">
            {emptyMessage}
          </Text>
        ) : (
          found.map((section) => (
            <Box key={section.key} gap={14} mb={34}>
              <Text variant="overlineTv" color="textDim">
                {section.title}
              </Text>
              <Grid width={width} min={MIN_POSTER_W} gap={GAP}>
                {section.hits.map((h) => (
                  <PosterCard
                    key={h.id}
                    title={h.title}
                    art={h.poster}
                    tint={h.colors}
                    onPress={h.onOpen}
                    onLongPress={h.onLongPress}
                  />
                ))}
              </Grid>
            </Box>
          ))
        )}
      </FocusScroll>
    </TopFade>
  );
}

const GAP = 24;
const MIN_POSTER_W = 250;

const sDefinition = styles({
  scroll: { flex: true, minH: 0 },
  content: { px: 20 },
});
