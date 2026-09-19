import { useEffect, useState } from 'react';
import { fetchStats, type Stats } from '#site/lib/stats';

export type StatsState =
  | { kind: 'loading' }
  | { kind: 'ready'; stats: Stats; fetchedAt: number }
  | { kind: 'failed' };

// The page is prerendered, so the numbers are fetched in the browser: the build
// would otherwise bake a snapshot that is wrong by the time anyone reads it.
export function useStats(): StatsState {
  const [state, setState] = useState<StatsState>({ kind: 'loading' });

  useEffect(() => {
    const abort = new AbortController();
    fetchStats(abort.signal)
      .then((stats) => setState({ kind: 'ready', stats, fetchedAt: Math.floor(Date.now() / 1000) }))
      .catch(() => {
        if (!abort.signal.aborted) setState({ kind: 'failed' });
      });
    return () => abort.abort();
  }, []);

  return state;
}
