import type { ScoredReleaseView } from '@kromatv/client/requests';
import { useMemo, useState } from 'react';
import { type ReleaseSort, sortReleases } from './release-sort';
import { countByTab, inTab, openingTab, type ReleaseTab, type TabCounts } from './release-tab';

/** A stable empty list, so a dialog that has not searched yet does not rebuild
 *  its view on every render. */
export const NO_RELEASES: readonly ScoredReleaseView[] = [];

export interface ReleaseView {
  tab: ReleaseTab;
  setTab: (next: ReleaseTab) => void;
  sort: ReleaseSort;
  setSort: (next: ReleaseSort) => void;
  counts: TabCounts;
  rows: ScoredReleaseView[];
}

export function useReleaseView(releases: readonly ScoredReleaseView[]): ReleaseView {
  const [sort, setSort] = useState<ReleaseSort>('score');
  const [chosen, setChosen] = useState<ReleaseTab | null>(null);
  const counts = useMemo(() => countByTab(releases), [releases]);
  const tab = chosen ?? openingTab(counts);
  const rows = useMemo(
    () =>
      sortReleases(
        releases.filter((release) => inTab(release, tab)),
        sort,
      ),
    [releases, tab, sort],
  );
  return { tab, setTab: setChosen, sort, setSort, counts, rows };
}
