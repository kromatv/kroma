import type { EpisodeMonitoringBody, LibraryTitle } from '@kromatv/client/monitoring';
import type { RequestKind } from '@kromatv/client/requests';
import { usePoll } from '@kromatv/module-sdk';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { titleKey } from '#web/features/admin/monitoring-index-model';
import { useAuth } from '#web/shared/lib/auth';

const ROOT = ['admin', 'monitoring'] as const;

export function useMonitoredTitles() {
  const { client } = useAuth();
  return usePoll([...ROOT, 'all'], () => client.monitoring.list(), 30_000);
}

export function useLibraryIndex() {
  const { client } = useAuth();
  return usePoll([...ROOT, 'library'], () => client.monitoring.library(), 60_000);
}

export interface TitleFollow {
  isSaving: (row: LibraryTitle) => boolean;
  set: (row: LibraryTitle, monitored: boolean) => void;
}

export function useTitleFollow({
  onSaved,
  onFailed,
}: Readonly<{
  onSaved: (row: LibraryTitle, monitored: boolean, undo: () => void) => void;
  onFailed: () => void;
}>): TitleFollow {
  const { client } = useAuth();
  const refresh = useMonitoringRefresh();
  const [saving, setSaving] = useState<ReadonlySet<string>>(() => new Set());
  const release = (key: string) =>
    setSaving((titles) => {
      const left = new Set(titles);
      left.delete(key);
      return left;
    });
  const set = (row: LibraryTitle, monitored: boolean) => {
    const tmdbId = row.tmdbId;
    if (tmdbId === null) return;
    const key = titleKey(row);
    setSaving((titles) => new Set(titles).add(key));
    const call = monitored
      ? client.monitoring.monitor(row.kind, tmdbId)
      : client.monitoring.unmonitor(row.kind, tmdbId);
    call
      .then(
        async () => {
          await refresh();
          onSaved(row, monitored, () => set(row, !monitored));
        },
        () => onFailed(),
      )
      .finally(() => release(key));
  };
  return { isSaving: (row) => saving.has(titleKey(row)), set };
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

export interface EpisodeUnit {
  season: number;
  episode?: number;
}

export interface EpisodeMonitoring {
  isSaving: (unit: EpisodeUnit) => boolean;
  set: (unit: EpisodeUnit, monitored: boolean) => void;
}

export function unitKey(unit: EpisodeUnit): string {
  return unit.episode === undefined ? `s${unit.season}` : `s${unit.season}e${unit.episode}`;
}

function bodyOf(unit: EpisodeUnit, monitored: boolean): EpisodeMonitoringBody {
  if (unit.episode === undefined) return { seasons: [{ season: unit.season, monitored }] };
  return { episodes: [{ season: unit.season, episode: unit.episode, monitored }] };
}

export function useEpisodeMonitoring({
  tmdbId,
  onSaved,
  onFailed,
}: Readonly<{
  tmdbId: number;
  onSaved: (unit: EpisodeUnit, monitored: boolean, undo: () => void) => void;
  onFailed: () => void;
}>): EpisodeMonitoring {
  const { client } = useAuth();
  const refresh = useMonitoringRefresh();
  const [saving, setSaving] = useState<ReadonlySet<string>>(() => new Set());
  const release = (key: string) =>
    setSaving((units) => {
      const left = new Set(units);
      left.delete(key);
      return left;
    });
  const set = (unit: EpisodeUnit, monitored: boolean) => {
    const key = unitKey(unit);
    setSaving((units) => new Set(units).add(key));
    client.monitoring
      .setEpisodes(tmdbId, bodyOf(unit, monitored))
      .then(
        async () => {
          await refresh();
          onSaved(unit, monitored, () => set(unit, !monitored));
        },
        () => onFailed(),
      )
      .finally(() => release(key));
  };
  return { isSaving: (unit) => saving.has(unitKey(unit)), set };
}
