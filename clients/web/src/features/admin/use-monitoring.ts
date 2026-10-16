import type { RequestKind } from '@kromatv/client/requests';
import { usePoll } from '@kromatv/module-sdk';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useAuth } from '#web/shared/lib/auth';

const ROOT = ['admin', 'monitoring'] as const;

export function useMonitoredTitles() {
  const { client } = useAuth();
  return usePoll([...ROOT, 'all'], () => client.monitoring.list(), 30_000);
}

export function useTitleLedger(kind: RequestKind, tmdbId: number) {
  const { client } = useAuth();
  return useQuery({
    queryKey: [...ROOT, kind, tmdbId, 'ledger'],
    queryFn: () => client.monitoring.ledger(kind, tmdbId),
    staleTime: 60_000,
  });
}

export function useSeasonLedger(tmdbId: number, season: number, enabled: boolean) {
  const { client } = useAuth();
  return useQuery({
    queryKey: [...ROOT, 'show', tmdbId, 'season', season],
    queryFn: () => client.monitoring.seasonLedger(tmdbId, season),
    enabled,
  });
}

export function useMonitoringRefresh(): () => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(() => queryClient.invalidateQueries({ queryKey: ROOT }), [queryClient]);
}
