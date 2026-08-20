import type { KromaClient, MediaItem } from '@kroma/core';
import { useCallback, useEffect, useState } from 'react';

export interface ResolvedStart {
  startSec: number | null;
  setStartSec: (sec: number) => void;
}

export function useResolvedStart(client: KromaClient, item: MediaItem): ResolvedStart {
  // Resolved BEFORE the engine is built so it opens there; loading at 0 and re-seeking
  // reloads the whole stream. Keyed by id: an item swap leaves this stale for a render.
  const [resolved, setResolved] = useState<{ id: string; sec: number } | null>(null);
  useEffect(() => {
    if (!client.hasAuth) {
      setResolved({ id: item.id, sec: 0 });
      return;
    }
    let done = false;
    const settle = (sec: number) => {
      if (done) return;
      done = true;
      setResolved({ id: item.id, sec });
    };
    // Never let a stalled progress fetch block playback forever.
    const timer = setTimeout(() => settle(0), 4000);
    client
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

  return { startSec: resolved?.id === item.id ? resolved.sec : null, setStartSec };
}
