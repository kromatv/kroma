import type { ScoredReleaseView } from '@kromatv/client/requests';
import type { SortColumn } from '@kromatv/ui/kit';
import { useMemo, useState } from 'react';
import { filterReleases, type ReleaseFilter, type ReleaseSort, sortReleases } from './release-sort';

export interface ReleaseView {
  filter: ReleaseFilter;
  setFilter: (next: ReleaseFilter) => void;
  sort: ReleaseSort;
  setSort: (next: ReleaseSort) => void;
  columns: readonly SortColumn[];
  rows: ScoredReleaseView[];
  acceptedCount: number;
  rejectedCount: number;
}

export function useReleaseView(releases: readonly ScoredReleaseView[]): ReleaseView {
  const [sort, setSort] = useState<ReleaseSort>('score');
  const [filter, setFilter] = useState<ReleaseFilter>('accepted');
  const rows = useMemo(
    () => sortReleases(filterReleases(releases, filter), sort),
    [releases, filter, sort],
  );
  const columns = useMemo<readonly SortColumn[]>(
    () => [{ column: sort, direction: 'desc' }],
    [sort],
  );
  const acceptedCount = releases.filter((release) => release.score != null).length;
  return {
    filter,
    setFilter,
    sort,
    setSort,
    columns,
    rows,
    acceptedCount,
    rejectedCount: releases.length - acceptedCount,
  };
}
