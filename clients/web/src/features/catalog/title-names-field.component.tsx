import { TITLE_EDIT_LIMITS } from '@kromatv/client/media';
import { useT } from '@kromatv/ui';
import { Field, TagField } from '@kromatv/ui/kit';
import { type ReactNode, useState } from 'react';
import type { ReadyInfo } from '#web/features/catalog/title-info-fields.component';
import { faceOf, personItems } from '#web/features/catalog/person-items';
import { namesShown } from '#web/features/catalog/title-info-draft';
import { resetAction } from '#web/features/catalog/title-info-reset';
import type { TitleShown } from '#web/features/catalog/title-shown';
import {
  useLibraryGenres,
  usePeopleSearch,
  useStudioSearch,
} from '#web/features/catalog/use-name-suggestions.hook';
import type { ListKey } from '#web/features/catalog/use-title-info.hook';

const PAGE_NAMES: Readonly<Record<ListKey, (shown: TitleShown) => readonly string[]>> = {
  genres: (shown) => shown.genres,
  studios: (shown) => shown.studios,
  directors: (shown) => shown.directors.map((person) => person.name),
};

const LABEL = {
  genres: 'titleInfo.genres',
  studios: 'titleInfo.studios',
  directors: 'titleInfo.directors',
} as const;

const HINT = {
  genres: 'titleInfo.genresHint',
  studios: 'titleInfo.studiosHint',
  directors: 'titleInfo.directorsHint',
} as const;

function useNames(info: ReadyInfo, field: ListKey) {
  const page = info.shown ? PAGE_NAMES[field](info.shown) : [];
  const wasWritten = info.loaded[field] !== null;
  const held = info.draft[field];
  return {
    names: namesShown(held, { page, wasWritten }),
    reset: held === null ? null : () => info.setNames(field)(null),
    resetDone: wasWritten && held === null,
    onNames: (names: string[]) => info.setNames(field)(names),
  };
}

type Shell = Readonly<{ info: ReadyInfo; field: ListKey; children: ReactNode }>;

function NamesShell({ info, field, children }: Shell) {
  const t = useT();
  const { reset, resetDone } = useNames(info, field);
  return (
    <Field.Root label={t(LABEL[field])}>
      {children}
      {resetAction(t('titleInfo.reset'), reset)}
      <Field.Hint>{resetDone ? t('titleInfo.resetNote') : t(HINT[field])}</Field.Hint>
    </Field.Root>
  );
}

/** The genres, with those of the library offered as the person types. */
export function GenresField({ info }: Readonly<{ info: ReadyInfo }>) {
  const t = useT();
  const { names, onNames } = useNames(info, 'genres');
  const genres = useLibraryGenres();
  return (
    <NamesShell info={info} field="genres">
      <TagField.Root
        value={names}
        onValueChange={onNames}
        max={TITLE_EDIT_LIMITS.genres}
        placeholder={t('titleInfo.genresPlaceholder')}
      >
        {genres.map((genre) => (
          <TagField.Item key={genre} value={genre} />
        ))}
      </TagField.Root>
    </NamesShell>
  );
}

function directorFaces(shown: TitleShown | undefined) {
  return (shown?.directors ?? []).map((person) => (
    <TagField.Tag key={person.name} value={person.name}>
      <TagField.Media src={faceOf(person.profileUrl)} />
    </TagField.Tag>
  ));
}

/** The directors, with the people TMDB knows under what is typed, each with
 * their photo and the titles they are known for. */
export function DirectorsField({ info }: Readonly<{ info: ReadyInfo }>) {
  const t = useT();
  const { names, onNames } = useNames(info, 'directors');
  const [query, setQuery] = useState('');
  const { people, loading } = usePeopleSearch(query);
  return (
    <NamesShell info={info} field="directors">
      <TagField.Root
        value={names}
        onValueChange={onNames}
        query={query}
        onQueryChange={setQuery}
        filter={false}
        loading={loading}
        max={TITLE_EDIT_LIMITS.directors}
        placeholder={t('titleInfo.personPlaceholder')}
      >
        {directorFaces(info.shown)}
        {personItems(people, TagField)}
      </TagField.Root>
    </NamesShell>
  );
}

/** The studios, with the companies TMDB knows under what is typed, each with
 * its logo and its country. */
export function StudiosField({ info }: Readonly<{ info: ReadyInfo }>) {
  const t = useT();
  const { names, onNames } = useNames(info, 'studios');
  const [query, setQuery] = useState('');
  const { studios, loading } = useStudioSearch(query);
  return (
    <NamesShell info={info} field="studios">
      <TagField.Root
        value={names}
        onValueChange={onNames}
        query={query}
        onQueryChange={setQuery}
        filter={false}
        loading={loading}
        max={TITLE_EDIT_LIMITS.studios}
        placeholder={t('titleInfo.studioPlaceholder')}
      >
        {studios.map((studio) => (
          <TagField.Item key={studio.tmdbId} value={studio.name}>
            <TagField.Media src={faceOf(studio.logoUrl)} logo />
            {studio.country ? <TagField.Hint>{studio.country}</TagField.Hint> : null}
          </TagField.Item>
        ))}
      </TagField.Root>
    </NamesShell>
  );
}
