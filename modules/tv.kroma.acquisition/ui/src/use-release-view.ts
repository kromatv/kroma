import type { ScoredReleaseView } from '@kromatv/client/requests';
import { useMemo, useState } from 'react';
import { type ReleaseSort, sortReleases } from './release-sort';

/** A stable empty list, so a dialog that has not searched yet does not rebuild
 *  its view on every render. */
export const NO_RELEASES: readonly ScoredReleaseView[] = [];

export interface ReleaseView {
  sort: ReleaseSort;
  setSort: (next: ReleaseSort) => void;
  rows: ScoredReleaseView[];
}

export function useReleaseView(releases: readonly ScoredReleaseView[]): ReleaseView {
  const [sort, setSort] = useState<ReleaseSort>('score');
  const rows = useMemo(() => sortReleases(releases, sort), [releases, sort]);
  return { sort, setSort, rows };
}
