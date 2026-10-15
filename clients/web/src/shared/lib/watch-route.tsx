import { tmdbKindOf } from '@kromatv/client/discovery';
import type { RequestKind } from '@kromatv/client/requests';
import type { WatchableTarget, WatchSubject } from '@kromatv/core';
import type { HostElement } from '@kromatv/ui/kit';
import { useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { RouteLink } from '#web/shared/ui/route-link';

export type EpisodeAt = { season: number; episode: number };

export function episodeAt(segment: string): EpisodeAt | null {
  const at = /^s(\d{1,3})e(\d{1,4})$/i.exec(segment);
  if (!at?.[1] || !at[2]) return null;
  return { season: Number(at[1]), episode: Number(at[2]) };
}

function episodeSegment({ season, episode }: EpisodeAt): string {
  return `s${season}e${episode}`;
}

export function watchLink(
  kind: RequestKind,
  tmdbId: number | null,
  at: EpisodeAt | null = null,
): HostElement | null {
  if (tmdbId === null) return null;
  const params = { type: tmdbKindOf(kind), tmdbId: String(tmdbId) };
  if (!at) return <RouteLink to="/watch/$type/$tmdbId" params={params} />;
  return <RouteLink to="/watch/$type/$tmdbId/$at" params={{ ...params, at: episodeSegment(at) }} />;
}

export function watchRoute(kind: RequestKind, tmdbId: number) {
  return {
    to: '/watch/$type/$tmdbId',
    params: { type: tmdbKindOf(kind), tmdbId: String(tmdbId) },
  } as const;
}

export function streamRoute({ entry, file }: WatchableTarget) {
  return {
    to: '/watch/stream/$downloadId',
    params: { downloadId: entry.id },
    search: { file: file.index },
  } as const;
}

export function useWatchSubjectRoute(): (subject: WatchSubject) => void {
  const navigate = useNavigate();
  return useCallback(
    (subject: WatchSubject) => {
      if (subject.kind === 'download') {
        void navigate({
          to: '/watch/stream/$downloadId',
          params: { downloadId: subject.downloadId },
          search: { file: subject.file ?? undefined },
        });
        return;
      }
      const { kind, tmdbId, season, episode } = subject.title;
      const params = { type: tmdbKindOf(kind), tmdbId: String(tmdbId) };
      if (season === null || episode === null) {
        void navigate({ to: '/watch/$type/$tmdbId', params });
        return;
      }
      void navigate({
        to: '/watch/$type/$tmdbId/$at',
        params: { ...params, at: episodeSegment({ season, episode }) },
      });
    },
    [navigate],
  );
}
