// The free-text sweep's own state: what is being hunted, and what came back.
//
// The season/episode boxes stay STRINGS. An empty box is "no number", which a
// number cannot say, and the target decides whether the box is asked for at all.

import { apiErrorText } from '@kroma/core';
import { useT } from '@kroma/module-sdk';
import { useCallback, useRef, useState } from 'react';
import { canSearch, type FreeTarget, scopeOf } from './free-search-target';
import type { ManualSearchView } from './schemas';

interface FreeSearchApi {
  search: (body: {
    query: string;
    kind?: string | null;
    season?: number | null;
    episode?: number | null;
  }) => Promise<ManualSearchView>;
}

export function useFreeSearch(
  api: FreeSearchApi,
  initialQuery: string,
  initialTarget: FreeTarget,
  initialSeason: number | null,
) {
  const t = useT();
  const [query, setQuery] = useState(initialQuery);
  const [target, setTarget] = useState<FreeTarget>(initialTarget);
  const [season, setSeason] = useState(initialSeason == null ? '' : String(initialSeason));
  const [episode, setEpisode] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<ManualSearchView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [grabbing, setGrabbing] = useState<string | null>(null);
  const generation = useRef(0);

  const ready = canSearch(query, target, season, episode);

  const run = useCallback(() => {
    if (!canSearch(query, target, season, episode)) return;
    generation.current += 1;
    const mine = generation.current;
    setBusy(true);
    setError(null);
    setView(null);
    api
      .search({ query: query.trim(), kind: target, ...scopeOf(target, season, episode) })
      .then((v) => {
        if (generation.current === mine) setView(v);
      })
      .catch((e) => {
        if (generation.current === mine) setError(apiErrorText(e, t('requests.searchFailed')));
      })
      .finally(() => {
        if (generation.current === mine) setBusy(false);
      });
  }, [api, t, query, target, season, episode]);

  // Changing what is hunted retires the answer to the old question.
  const pickTarget = useCallback((next: FreeTarget) => {
    setTarget(next);
    generation.current += 1;
    setView(null);
    setError(null);
  }, []);

  return {
    query,
    target,
    season,
    episode,
    busy,
    view,
    error,
    grabbing,
    ready,
    setQuery,
    setSeason,
    setEpisode,
    setGrabbing,
    pickTarget,
    run,
  };
}
