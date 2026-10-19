import type { KromaClient } from '@kromatv/client';
import type { MediaItem } from '@kromatv/client/media';
import { useCallback, useEffect, useState } from 'react';

export interface ResolvedStart {
  startSec: number | null;
  resumedAt: number | null;
  setStartSec: (sec: number) => void;
}

export function useResolvedStart(client: KromaClient, item: MediaItem): ResolvedStart {
  // Resolved BEFORE the engine is built so it opens there; loading at 0 and re-seeking
  // reloads the whole stream. Keyed by id: an item swap leaves this stale for a render.
  const [resolved, setResolved] = useState<{ id: string; sec: number } | null>(null);
  const [resumed, setResumed] = useState<{ id: string; sec: number } | null>(null);
  useEffect(() => {
    if (!client.hasAuth) return;
    let done = false;
    const settle = (sec: number) => {
      if (done) return;
      done = true;
      setResolved({ id: item.id, sec });
      setResumed({ id: item.id, sec });
    };
    // Never let a stalled progress fetch block playback forever.
    const timer = setTimeout(() => settle(0), 4000);
    client.playback
      .itemProgress(item.id)
      .then((p) => {
        const durMs = p?.durationMs ?? item.durationMs ?? 0;
        const posSec = p ? p.positionMs / 1000 : 0;
        // Resume only when meaningfully into the title and not ~finished.
        settle(p && posSec > 15 && (!durMs || p.positionMs < durMs * 0.95) ? posSec : 0);
      })
      .catch(() => settle(0));
    return () => {
      done = true;
      clearTimeout(timer);
    };
  }, [client, item]);

  const setStartSec = useCallback((sec: number) => setResolved({ id: item.id, sec }), [item.id]);

  let startSec: number | null = null;
  if (resolved?.id === item.id) startSec = resolved.sec;
  else if (!client.hasAuth) startSec = 0;

  return {
    startSec,
    resumedAt: resumed?.id === item.id && resumed.sec > 0 ? resumed.sec : null,
    setStartSec,
  };
}
