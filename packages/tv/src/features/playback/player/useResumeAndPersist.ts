import type { KromaClient } from '@kromatv/client';
import type { MediaItem } from '@kromatv/client/media';
import { useCallback, useEffect, useRef } from 'react';

/** The slice of the engine persistence needs, shared by `<video>` and AVPlay. */
export interface PersistPort {
  getPosition: () => number;
  getDuration: () => number;
  paused: boolean;
  endedNonce: number;
}

/** Persists progress every 10 s, on pause, and on exit; the server turns a
 * position past the credits or the played threshold into a watched flag. The
 * resume position is applied by `useDirectPlayback` as `startSec`, not
 * re-seeked here. */
export function useResumeAndPersist(client: KromaClient, item: MediaItem, port: PersistPort): void {
  const portRef = useRef(port);
  useEffect(() => {
    portRef.current = port;
  });

  const save = useCallback(() => {
    if (!client.hasAuth) return;
    const p = portRef.current;
    const d = p.getDuration();
    const pos = p.getPosition();
    if (!Number.isFinite(d) || d <= 0 || pos < 5) return;
    void client.playback.save(item.id, pos * 1000, d * 1000).catch(() => undefined);
  }, [client, item]);

  useEffect(() => {
    if (!client.hasAuth) return;
    const interval = setInterval(save, 10000);
    return () => {
      clearInterval(interval);
      save();
    };
  }, [client, save]);

  useEffect(() => {
    if (port.paused) save();
  }, [port.paused, save]);

  useEffect(() => {
    if (port.endedNonce > 0 && client.hasAuth) void client.playback.markWatched(item.id);
  }, [port.endedNonce, client, item]);
}
