import { apiErrorText } from '@kromatv/client';
import { useT } from '@kromatv/ui';
import { useEffect, useState } from 'react';
import type { MonitorCandidate } from '#web/features/admin/monitoring-model';
import { useAuth } from '#web/shared/lib/auth';

const DEBOUNCE_MS = 350;
const MIN_CHARS = 2;

interface Answer {
  query: string | null;
  results: MonitorCandidate[] | null;
  error: string | null;
}

const IDLE: Answer = { query: null, results: null, error: null };

export interface DiscoverState {
  results: MonitorCandidate[] | null;
  busy: boolean;
  error: string | null;
}

export function useDiscoveredTitles(needle: string, enabled: boolean): DiscoverState {
  const t = useT();
  const { client } = useAuth();
  const [answer, setAnswer] = useState<Answer>(IDLE);
  const query = needle.trim();
  const short = query.length < MIN_CHARS;
  const active = enabled && !short;
  if (!active && answer !== IDLE) setAnswer(IDLE);

  useEffect(() => {
    if (!enabled || short) return;
    let live = true;
    const at = setTimeout(() => {
      client.discovery.search(query).then(
        (found) => {
          if (!live) return;
          setAnswer({
            query,
            results: found.results.map((entry) => ({
              kind: entry.kind,
              tmdbId: entry.tmdbId,
              title: entry.title,
              year: entry.year,
              posterUrl: entry.posterUrl,
            })),
            error: null,
          });
        },
        (cause: unknown) => {
          if (!live) return;
          setAnswer({
            query,
            results: null,
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

  return { results: answer.results, busy: active && answer.query !== query, error: answer.error };
}
