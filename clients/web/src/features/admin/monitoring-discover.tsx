import { apiErrorText } from '@kromatv/client';
import { useT } from '@kromatv/ui';
import { useEffect, useState } from 'react';
import type { MonitorCandidate } from '#web/features/admin/monitoring-model';
import { useAuth } from '#web/shared/lib/auth';

const DEBOUNCE_MS = 350;
const MIN_CHARS = 2;

export interface DiscoverState {
  results: MonitorCandidate[] | null;
  busy: boolean;
  error: string | null;
}

export function useDiscoveredTitles(needle: string, enabled: boolean): DiscoverState {
  const t = useT();
  const { client } = useAuth();
  const [state, setState] = useState<DiscoverState>({
    results: null,
    busy: false,
    error: null,
  });
  const query = needle.trim();
  const short = query.length < MIN_CHARS;

  useEffect(() => {
    if (!enabled || short) {
      setState({ results: null, busy: false, error: null });
      return;
    }
    setState((current) => ({ ...current, busy: true }));
    let live = true;
    const at = setTimeout(() => {
      client.discovery.search(query).then(
        (answer) => {
          if (!live) return;
          setState({
            results: answer.results.map((entry) => ({
              kind: entry.kind,
              tmdbId: entry.tmdbId,
              title: entry.title,
              year: entry.year,
              posterUrl: entry.posterUrl,
            })),
            busy: false,
            error: null,
          });
        },
        (cause: unknown) => {
          if (!live) return;
          setState({
            results: null,
            busy: false,
            error: apiErrorText(cause, t('monitoring.addExternalFailed')),
          });
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(at);
    };
  }, [client, t, query, short, enabled]);

  return state;
}
