import { useState } from 'react';
import { Box } from '#ui/components/atoms/box';
import { Field } from '#ui/components/molecules/field';
import type { ControlSize } from '#ui/lib/field-shell';
import { TagField, type TagFieldRootProps } from './tag-field.component';

export const GENRES = [
  'Action',
  'Adventure',
  'Animation',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Fantasy',
  'Horror',
  'Science-Fiction',
  'Thriller',
];

const PHOTO = 'https://picsum.photos/seed';

const WORDMARK =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><text x='20' y='27' font-family='Arial' font-weight='900' font-size='17' text-anchor='middle'>A24</text></svg>";

export const DIRECTORS: readonly { name: string; photo: string | null; known: string }[] = [
  { name: 'Denis Villeneuve', photo: `${PHOTO}/kroma-villeneuve/96`, known: 'Dune' },
  { name: 'Greta Gerwig', photo: `${PHOTO}/kroma-gerwig/96`, known: 'Lady Bird' },
  { name: 'Céline Sciamma', photo: null, known: 'Portrait of a Lady on Fire' },
  { name: 'Bong Joon-ho', photo: `${PHOTO}/kroma-bong/96`, known: 'Parasite' },
];

export const STUDIOS: readonly { name: string; logo: string | null }[] = [
  { name: 'Legendary Pictures', logo: null },
  { name: 'Warner Bros. Pictures', logo: null },
  { name: 'A24', logo: WORDMARK },
];

export interface FieldArgs {
  size?: ControlSize;
  invalid?: boolean;
  disabled?: boolean;
}

type GenreProps = FieldArgs & Pick<TagFieldRootProps, 'presentation' | 'max'>;

/** Genres from the library, matched locally as the person types. */
export function Genres({ presentation, max, ...args }: Readonly<GenreProps>) {
  const [genres, setGenres] = useState<string[]>(['Drama', 'Science-Fiction']);
  return (
    <Field.Root label="Genres" size={args.size}>
      <TagField.Root
        value={genres}
        onValueChange={setGenres}
        placeholder="Add a genre"
        presentation={presentation}
        max={max}
        {...args}
      >
        {GENRES.map((genre) => (
          <TagField.Item key={genre} value={genre} />
        ))}
      </TagField.Root>
      <Field.Hint>Pick from the library, or type a new one.</Field.Hint>
    </Field.Root>
  );
}

/** Directors from a search, with a face and the work that tells two of the
 *  same name apart. */
function searchDirectors(query: string) {
  const needle = query.trim().toLowerCase();
  return needle === ''
    ? []
    : DIRECTORS.filter((person) => person.name.toLowerCase().includes(needle));
}

const DIRECTOR_FACES = DIRECTORS.map((person) => (
  <TagField.Tag key={person.name} value={person.name}>
    <TagField.Media src={person.photo} />
  </TagField.Tag>
));

export function Directors({ presentation, ...args }: Readonly<GenreProps>) {
  const [names, setNames] = useState<string[]>(['Denis Villeneuve']);
  const [query, setQuery] = useState('');
  return (
    <Field.Root label="Directors" size={args.size}>
      <TagField.Root
        value={names}
        onValueChange={setNames}
        query={query}
        onQueryChange={setQuery}
        filter={false}
        placeholder="Search for a person"
        presentation={presentation}
        {...args}
      >
        {DIRECTOR_FACES}
        {searchDirectors(query).map((person) => (
          <TagField.Item key={person.name} value={person.name}>
            <TagField.Media src={person.photo} />
            <TagField.Hint>{`Directing · ${person.known}`}</TagField.Hint>
          </TagField.Item>
        ))}
        <TagField.Empty>No one by that name on TMDB.</TagField.Empty>
      </TagField.Root>
    </Field.Root>
  );
}

/** Studios, drawn with their logo where there is one. */
export function Studios(args: Readonly<FieldArgs>) {
  const [studios, setStudios] = useState<string[]>(['Legendary Pictures', 'A24']);
  return (
    <Field.Root label="Studios" size={args.size}>
      <TagField.Root value={studios} onValueChange={setStudios} {...args}>
        {STUDIOS.map((studio) => (
          <TagField.Tag key={studio.name} value={studio.name}>
            <TagField.Media src={studio.logo} logo />
          </TagField.Tag>
        ))}
        {STUDIOS.map((studio) => (
          <TagField.Item key={studio.name} value={studio.name}>
            <TagField.Media src={studio.logo} logo />
          </TagField.Item>
        ))}
      </TagField.Root>
    </Field.Root>
  );
}

/** The three side by side with a plain field, so the wells line up. */
export function Form(args: Readonly<FieldArgs>) {
  return (
    <Box gap={20}>
      <Field.Root label="Title" size={args.size}>
        <Field.Input defaultValue="Dune: Part Two" />
      </Field.Root>
      <Genres {...args} />
      <Directors {...args} />
      <Studios {...args} />
    </Box>
  );
}
