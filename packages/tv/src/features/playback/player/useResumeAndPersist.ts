import type { KromaClient, MediaItem } from '@kroma/core';
import { useCallback, useEffect, useRef } from 'react';

/** The slice of the engine persistence needs, shared by `<video>` and AVPlay. */
export interface PersistPort {
  getPosition: () => number;
  getDuration: () => number;
  paused: boolean;
  endedNonce: number;
}

/** Persists progress every 10 s, on pause, near the end, and on exit. The resume
 * position is applied by `useDirectPlayback` as `startSec`, not re-seeked here. */
export function useResumeAndPersist(client: KromaClient, item: MediaItem, port: PersistPort): void {
  const portRef = useRef(port);
  portRef.current = port;

  const save = useCallback(() => {
    if (!client.hasAuth) return;
    const p = portRef.current;
    const d = p.getDuration();
    const pos = p.getPosition();
    if (!Number.isFinite(d) || d <= 0 || pos < 5) return;
    // Marking watched also clears the resume position server-side.
    if (pos > d * 0.97) void client.markWatched(item.id);
    else void client.saveProgress(item.id, pos * 1000, d * 1000);
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
    if (port.endedNonce > 0 && client.hasAuth) void client.markWatched(item.id);
  }, [port.endedNonce, client, item]);
}
