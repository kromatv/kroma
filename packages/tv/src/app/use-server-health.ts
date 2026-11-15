import type { KromaClient } from '@kromatv/client';
import { type CompatVerdict, checkCompat, type ServerBuild } from '@kromatv/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CLIENT_BUILD } from '#tv/app/client-build';
import { startHealthMonitor } from '#tv/app/health-monitor';

const ONLINE_MS = 8000;
const OFFLINE_MS = 3000;
// A dead server never refuses the TCP connection cleanly, so a bare fetch hangs.
const TIMEOUT_MS = 4000;

/** Polls the active server's `/api/health` to keep an `online` flag, calling
 * `onReconnect` on every offline→online edge. Gated on `enabled` (a live
 * session). */
export function useServerHealth(
  client: KromaClient | null,
  enabled: boolean,
  onReconnect?: () => void,
): { online: boolean; recheck: () => void; serverVersion: string | null; compat: CompatVerdict } {
  const [online, setOnline] = useState(true);
  const [server, setServer] = useState<ServerBuild | null>(null);
  // Ref so a fresh `onReconnect` closure each render doesn't restart the monitor.
  const reconnectRef = useRef(onReconnect);
  useEffect(() => {
    reconnectRef.current = onReconnect;
  });
  const kickRef = useRef<() => void>(() => {});

  const active = !!client && enabled;
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (!active) {
      setOnline(true);
      setServer(null);
    }
  }

  useEffect(() => {
    if (!client || !enabled) {
      return;
    }
    const monitor = startHealthMonitor({
      probe: async () => {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        try {
          const health = await client.media.health({ signal: ctrl.signal });
          setServer({ version: health.version, minClient: health.minClient });
          return true;
        } catch {
          return false;
        } finally {
          clearTimeout(to);
        }
      },
      onChange: setOnline,
      onReconnect: () => reconnectRef.current?.(),
      onlineMs: ONLINE_MS,
      offlineMs: OFFLINE_MS,
    });
    kickRef.current = monitor.recheck;
    return () => {
      kickRef.current = () => {};
      monitor.stop();
    };
  }, [client, enabled]);

  const recheck = useCallback(() => kickRef.current(), []);
  const compat: CompatVerdict = server ? checkCompat(CLIENT_BUILD, server) : 'ok';
  return { online, recheck, serverVersion: server?.version ?? null, compat };
}
