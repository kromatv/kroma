import { apiErrorText } from '@kromatv/client';
import type {
  InteractiveSearchView,
  ScoredReleaseView,
  SearchScope,
} from '@kromatv/client/requests';
import { useT } from '@kromatv/module-sdk';
import { useCallback, useRef, useState } from 'react';

export interface SearchState {
  busy: boolean;
  grabbing: boolean;
  view: InteractiveSearchView | null;
  scope: SearchScope | null;
  error: string | null;
  grabbed: { title: string; error: boolean } | null;
}

export interface SearchRunner {
  state: SearchState;
  run: (scope: SearchScope) => void;
  grab: (release: ScoredReleaseView) => void;
  reset: () => void;
}

const IDLE: SearchState = {
  busy: false,
  grabbing: false,
  view: null,
  scope: null,
  error: null,
  grabbed: null,
};

export function useSearchRunner(
  search: (scope: SearchScope) => Promise<InteractiveSearchView>,
  grabOne: (scope: SearchScope, release: ScoredReleaseView) => Promise<unknown>,
): SearchRunner {
  const t = useT();
  const [state, setState] = useState<SearchState>(IDLE);
  const generation = useRef(0);

  const run = useCallback(
    (scope: SearchScope) => {
      generation.current += 1;
      const mine = generation.current;
      setState({ ...IDLE, busy: true, scope });
      search(scope)
        .then((view) => {
          if (generation.current === mine) setState({ ...IDLE, view, scope });
        })
        .catch((e) => {
          if (generation.current === mine) {
            setState({ ...IDLE, scope, error: apiErrorText(e, t('requests.searchFailed')) });
          }
        });
    },
    [search, t],
  );

  const grab = useCallback(
    (release: ScoredReleaseView) => {
      const scope = state.scope;
      if (!scope) return;
      const mine = generation.current;
      setState((s) => ({ ...s, grabbing: true, grabbed: null }));
      grabOne(scope, release)
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
    [grabOne, t, state.scope],
  );

  const reset = useCallback(() => {
    generation.current += 1;
    setState(IDLE);
  }, []);

  return { state, run, grab, reset };
}
