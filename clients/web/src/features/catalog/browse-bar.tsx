import { type GenreCount, type MessageKey, SORT_MODES, type SortMode } from '@kroma/core';
import { useT } from '@kroma/ui';
import { Chip } from '@kroma/ui/kit';
import { Select } from '#web/shared/ui';

const SORT_LABEL_KEY: Record<SortMode, MessageKey> = {
  added: 'browse.sort.added',
  release: 'browse.sort.release',
  title: 'browse.sort.title',
  rating: 'browse.sort.rating',
};

export interface BrowseBarProps {
  sort: SortMode;
  onSort: (mode: SortMode) => void;
  genres: GenreCount[];
  genre?: string;
  onGenre: (genre: string | undefined) => void;
}

/** The controls above a catalogue grid: a "Sort by" dropdown and a genre filter
 * chip row. Purely presentational the parent owns the state (URL search params),
 * so it stays shareable and survives a refresh. */
export function BrowseBar({ sort, onSort, genres, genre, onGenre }: Readonly<BrowseBarProps>) {
  const t = useT();
  return (
    <div className="mb-6 mt-5 flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <span className="text-[13px] font-semibold text-dim">{t('browse.sortBy')}</span>
        <Select
          ariaLabel={t('browse.sortBy')}
          value={sort}
          onChange={(v) => onSort(v as SortMode)}
          options={SORT_MODES.map((mode) => ({ value: mode, label: t(SORT_LABEL_KEY[mode]) }))}
        />
      </div>
      {genres.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <Chip
            active={!genre}
            variant="subtle"
            label={t('browse.allGenres')}
            onPress={() => onGenre(undefined)}
          />
          {genres.map((g) => (
            <Chip
              key={g.name}
              active={g.name === genre}
              variant="subtle"
              label={g.name}
              onPress={() => onGenre(g.name)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
