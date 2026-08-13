// The release search's own state: what the last sweep was aimed at, what it
// answered, and the last grab. Kept out of the page so the page stays layout.
//
// The scope is set by pointing at something in the ledger rather than by filling
// a picker, so it arrives whole and a search is never run against a half-chosen
// target.

import {
  apiErrorText,
  type InteractiveSearchView,
  type ScoredReleaseView,
  type SearchScope,
} from '@kroma/core';
import { useAdminHost, useT } from '@kroma/module-sdk';
import { useCallback, useRef, useState } from 'react';

export interface SearchState {
  busy: boolean;
  grabbing: boolean;
  view: InteractiveSearchView | null;
  /** The scope `view` answers. A grab sends this, never a live picker: the two
   *  part company the moment anything moves. */
  scope: SearchScope | null;
  error: string | null;
  grabbed: { title: string; error: boolean } | null;
}

const IDLE: SearchState = {
  busy: false,
  grabbing: false,
  view: null,
  scope: null,
  error: null,
  grabbed: null,
};

export function useReleaseSearch(requestId: string) {
  const t = useT();
  const { client } = useAdminHost();
  const [state, setState] = useState<SearchState>(IDLE);
  // A sweep is many indexer round trips: anything that retargets it retires the
  // one in flight.
  const generation = useRef(0);

  const run = useCallback(
    (scope: SearchScope) => {
      generation.current += 1;
      const mine = generation.current;
      setState({ ...IDLE, busy: true, scope });
      client
        .searchReleases(requestId, scope)
        .then((view) => {
          if (generation.current === mine) setState({ ...IDLE, view, scope });
        })
        .catch((e) => {
          if (generation.current === mine) {
            setState({ ...IDLE, scope, error: apiErrorText(e, t('requests.searchFailed')) });
          }
        });
    },
    [client, t, requestId],
  );

  const grab = useCallback(
    (release: ScoredReleaseView) => {
      const scope = state.scope;
      if (!scope) return;
      const mine = generation.current;
      setState((s) => ({ ...s, grabbing: true, grabbed: null }));
      client
        .grabRelease(requestId, { guid: release.guid, indexerId: release.indexerId, ...scope })
        .then(() => {
          if (generation.current !== mine) return;
          setState((s) => ({
            ...s,
            grabbing: false,
            grabbed: { title: release.title, error: false },
          }));
        })
        .catch((e) => {
          if (generation.current !== mine) return;
          setState((s) => ({
            ...s,
            grabbing: false,
            grabbed: { title: apiErrorText(e, t('requests.actionFailed')), error: true },
          }));
        });
    },
    [client, t, requestId, state.scope],
  );

  const reset = useCallback(() => {
    generation.current += 1;
    setState(IDLE);
  }, []);

  return { state, run, grab, reset };
}
