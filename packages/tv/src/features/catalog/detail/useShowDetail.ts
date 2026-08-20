import type { ShowDetail, UpNext } from '@kroma/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWatched } from '#tv/app/providers/watched';
import { useClient } from '#tv/app/router';

export interface ShowDetailState {
  detail: ShowDetail | null;
  error: string | null;
  season: number | null;
  setSeason: React.Dispatch<React.SetStateAction<number | null>>;
  activeSeason: ShowDetail['seasons'][number] | null;
  epProgress: Record<string, number>;
  toggleEpisodeWatched: (id: string) => void;
  upNext: UpNext | null;
}

/**
 * Everything the series screen loads for one show: its seasons, the selected
 * season, per-episode resume progress and the server's up-next pick.
 */
export function useShowDetail(showId: string): ShowDetailState {
  const client = useClient();
  const watched = useWatched();
  const [detail, setDetail] = useState<ShowDetail | null>(null);
  const [season, setSeason] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Per-episode resume progress (mapped by item id) for the episode thumbnails.
  const [epProgress, setEpProgress] = useState<Record<string, number>>({});
  // biome-ignore lint/correctness/useExhaustiveDependencies: show.id intentionally re-fetches when switching shows (the screen is reused on this route); it gates the effect even though the body reads it only indirectly.
  useEffect(() => {
    let cancelled = false;
    client
      .progress()
      .then((entries) => {
        if (cancelled) return;
        const map: Record<string, number> = {};
        for (const e of entries) {
          const dur = e.durationMs ?? 0;
          if (dur > 0 && e.positionMs > 0) {
            map[e.itemId] = Math.min(100, Math.round((e.positionMs / dur) * 100));
          }
        }
        setEpProgress(map);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, showId]);

  // Marking an episode watched also clears its resume position server-side, so
  // drop the local progress bar with it instead of leaving a stale one under a
  // watched badge.
  const toggleEpisodeWatched = useCallback(
    (id: string) => {
      const nowWatched = !watched.has(id);
      watched.toggle(id);
      if (nowWatched) {
        setEpProgress((cur) => {
          if (cur[id] == null) return cur;
          const { [id]: _gone, ...rest } = cur;
          return rest;
        });
      }
    },
    [watched],
  );

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setSeason(null);
    setError(null);
    client
      .show(showId)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setSeason(d.seasons[0]?.number ?? null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [client, showId]);

  const activeSeason = useMemo(
    () => detail?.seasons.find((entry) => entry.number === season) ?? detail?.seasons[0] ?? null,
    [detail, season],
  );

  // "Continue the series": resume in-progress, else next unwatched (per-user,
  // server-computed). Falls back to the first episode while loading.
  const [upNext, setUpNext] = useState<UpNext | null>(null);
  useEffect(() => {
    let cancelled = false;
    client
      .upNext(showId)
      .then((r) => {
        if (!cancelled) setUpNext(r);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, showId]);

  return {
    detail,
    error,
    season,
    setSeason,
    activeSeason,
    epProgress,
    toggleEpisodeWatched,
    upNext,
  };
}
