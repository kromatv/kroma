import type { RequestId, ScoredReleaseView, SearchScope } from '@kromatv/client/requests';
import { useAdminHost } from '@kromatv/module-sdk';
import { useCallback } from 'react';
import { type SearchRunner, useSearchRunner } from './use-search-runner.hook';

export type { SearchRunner, SearchState } from './use-search-runner.hook';

export function useReleaseSearch(requestId: RequestId): SearchRunner {
  const { client } = useAdminHost();
  const search = useCallback(
    (scope: SearchScope) => client.requests.searchReleases(requestId, scope),
    [client, requestId],
  );
  const grab = useCallback(
    (scope: SearchScope, release: ScoredReleaseView) =>
      client.requests.grab(requestId, {
        guid: release.guid,
        indexerId: release.indexerId,
        ...scope,
      }),
    [client, requestId],
  );
  return useSearchRunner(search, grab);
}
