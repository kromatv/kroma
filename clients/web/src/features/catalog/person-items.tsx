import type { TmdbPerson } from '@kromatv/client/media';
import { sizedImageUrl } from '@kromatv/core';
import type { ReactNode } from 'react';
import { imageUrl } from '#web/shared/lib/api';

const FACE = 64;

/** The parts a list of suggestions is written with, as `TagField` and
 * `Combobox` both name them. */
export type SuggestionParts = Readonly<{
  Item: (props: Readonly<{ value: string; children?: ReactNode }>) => ReactNode;
  Media: (props: Readonly<{ src?: string | null }>) => ReactNode;
  Hint: (props: Readonly<{ children?: ReactNode }>) => ReactNode;
}>;

/** A picture the server serves, at the size a tag or a suggestion draws it. */
export const faceOf = (url: string | null | undefined) => sizedImageUrl(imageUrl(url), FACE);

/** The people a TMDB search found, as suggestions with their photo and the
 * titles they are known for. */
export function personItems(people: readonly TmdbPerson[], { Item, Media, Hint }: SuggestionParts) {
  return people.map((person) => (
    <Item key={person.tmdbId} value={person.name}>
      <Media src={faceOf(person.photoUrl)} />
      {person.knownFor.length > 0 ? <Hint>{person.knownFor.join(', ')}</Hint> : null}
    </Item>
  ));
}
