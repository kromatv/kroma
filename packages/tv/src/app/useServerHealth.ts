import { type CompatVerdict, checkServerCompat, type KromaClient } from '@kroma/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CLIENT_BUILD } from '#tv/app/clientBuild';
import { startHealthMonitor } from '#tv/app/healthMonitor';

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
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  // Ref so a fresh `onReconnect` closure each render doesn't restart the monitor.
  const reconnectRef = useRef(onReconnect);
  reconnectRef.current = onReconnect;
  const kickRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!client || !enabled) {
      // No active session → assume reachable so the picker shows no offline chrome.
      setOnline(true);
      setServerVersion(null);
      return;
    }
    const monitor = startHealthMonitor({
      probe: async () => {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        try {
          const health = await client.health({ signal: ctrl.signal });
          setServerVersion(health.version);
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
  const compat: CompatVerdict = serverVersion
    ? checkServerCompat(CLIENT_BUILD, serverVersion)
    : 'ok';
  return { online, recheck, serverVersion, compat };
}
