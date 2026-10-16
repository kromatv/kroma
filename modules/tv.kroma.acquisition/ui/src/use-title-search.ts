import type { RequestKind, ScoredReleaseView, SearchScope } from '@kromatv/client/requests';
import { useCallback } from 'react';
import { useAcquisitionApi } from './api';
import { toTitleScope } from './title-scope';
import { type SearchRunner, useSearchRunner } from './use-search-runner';

export function useTitleSearch(kind: RequestKind, tmdbId: number): SearchRunner {
  const acquisition = useAcquisitionApi();
  const search = useCallback(
    (scope: SearchScope) => acquisition.searchTitle(kind, tmdbId, toTitleScope(scope)),
    [acquisition, kind, tmdbId],
  );
  const grab = useCallback(
    (scope: SearchScope, release: ScoredReleaseView) =>
      acquisition.grabForTitle(kind, tmdbId, {
        scope: toTitleScope(scope),
        guid: release.guid,
        indexerId: release.indexerId,
      }),
    [acquisition, kind, tmdbId],
  );
  return useSearchRunner(search, grab);
}
